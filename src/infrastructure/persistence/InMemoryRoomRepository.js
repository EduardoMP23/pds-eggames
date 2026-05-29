'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * InMemoryRoomRepository — implements RoomRepositoryPort using in-process Maps.
 *
 * This adapter owns no business logic.  It handles only storage concerns:
 * ID generation, Map operations, and the 30-second grace-period cleanup timer.
 */
class InMemoryRoomRepository {
  constructor() {
    /** @type {Map<string, Object>} roomId → room */
    this._rooms = new Map();
    /** @type {Map<string, Object>} socketId → { roomId, playerId, playerName } */
    this._players = new Map();
  }

  // ── RoomRepositoryPort implementation ──────────────────────────────────────

  createRoom(socketId, playerName, gameId, minPlayers, maxPlayers) {
    const roomId   = uuidv4().slice(0, 8);
    const playerId = uuidv4().slice(0, 8);

    const room = {
      roomId,
      gameId: gameId || 'hive',
      hostPlayerId: playerId,
      status: 'lobby',
      players: [{ playerId, playerName, socketId, connected: true }],
      minPlayers,
      maxPlayers,
      gameState: null
    };

    this._rooms.set(roomId, room);
    this._players.set(socketId, { roomId, playerId, playerName });
    return { room, playerId };
  }

  joinRoom(socketId, playerName, roomId, _avatar, _color, playerId) {
    const room = this._rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    // Allow reconnection before checking the game-in-progress guard.
    // Match by playerId first (works even if old socket is still connected),
    // then fall back to name + disconnected for legacy cases.
    const existing = room.players.find(p =>
      (playerId && p.playerId === playerId) ||
      (!playerId && p.playerName === playerName && !p.connected)
    );
    if (!existing) {
      if (room.status === 'playing') return { error: 'Game already in progress' };
      if (room.players.filter(p => p.connected).length >= room.maxPlayers) return { error: 'Room is full' };
    }

    if (room._cleanupTimer) {
      clearTimeout(room._cleanupTimer);
      room._cleanupTimer = null;
    }

    if (existing) {
      // Remove old socket mapping so a stale disconnect doesn't trigger host reassignment
      if (existing.socketId && existing.socketId !== socketId) {
        this._players.delete(existing.socketId);
      }

      existing.socketId  = socketId;
      existing.connected = true;
      this._players.set(socketId, { roomId, playerId: existing.playerId, playerName });

      // Cancel pending host reassignment if the host reconnected in time
      if (room._hostReassignTimer && existing.playerId === room.hostPlayerId) {
        clearTimeout(room._hostReassignTimer);
        room._hostReassignTimer = null;
      }

      return { room, playerId: existing.playerId, reconnected: true };
    }

    const playerId = uuidv4().slice(0, 8);
    room.players.push({ playerId, playerName, socketId, connected: true });
    this._players.set(socketId, { roomId, playerId, playerName });
    return { room, playerId };
  }

  getRoom(roomId) {
    return this._rooms.get(roomId) || null;
  }

  getPlayerInfo(socketId) {
    return this._players.get(socketId) || null;
  }

  removePlayer(socketId) {
    const info = this._players.get(socketId);
    if (!info) return null;

    const { roomId, playerId } = info;
    const room = this._rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.playerId === playerId);
    if (player) player.connected = false;
    this._players.delete(socketId);

    // Schedule room deletion after a grace period when all players leave
    const connectedCount = room.players.filter(p => p.connected).length;
    if (connectedCount === 0 && room.status !== 'playing') {
      room._cleanupTimer = setTimeout(() => {
        const r = this._rooms.get(roomId);
        if (r && r.players.filter(p => p.connected).length === 0 && r.status !== 'playing') {
          this._rooms.delete(roomId);
        }
      }, 30_000);
    }

    // If the disconnecting player is the host, schedule reassignment after 10s
    if (room.hostPlayerId === playerId) {
      if (room._hostReassignTimer) clearTimeout(room._hostReassignTimer);
      room._hostReassignTimer = setTimeout(() => {
        room._hostReassignTimer = null;
        const currentHost = room.players.find(p => p.playerId === room.hostPlayerId);
        if (currentHost?.connected) return;
        const next = room.players.find(p => p.connected);
        if (next) room.hostPlayerId = next.playerId;
      }, 10_000);
    }

    return { roomId, playerId, removed: false, room };
  }

  reassignHost(roomId) {
    // No-op: host reassignment is now handled with a delay in removePlayer.
  }

  listPublicRooms() {
    const result = [];
    for (const room of this._rooms.values()) {
      if (room.status === 'lobby') {
        result.push({
          roomId:      room.roomId,
          gameId:      room.gameId,
          playerCount: room.players.filter(p => p.connected).length,
          maxPlayers:  room.maxPlayers,
          hostName:    room.players.find(p => p.playerId === room.hostPlayerId)?.playerName
        });
      }
    }
    return result;
  }
}

module.exports = InMemoryRoomRepository;
