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

  joinRoom(socketId, playerName, roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    // Allow reconnection before checking the game-in-progress guard
    const existing = room.players.find(p => p.playerName === playerName && !p.connected);
    if (!existing) {
      if (room.status === 'playing') return { error: 'Game already in progress' };
      if (room.players.filter(p => p.connected).length >= room.maxPlayers) return { error: 'Room is full' };
    }

    if (room._cleanupTimer) {
      clearTimeout(room._cleanupTimer);
      room._cleanupTimer = null;
    }

    if (existing) {
      existing.socketId  = socketId;
      existing.connected = true;
      this._players.set(socketId, { roomId, playerId: existing.playerId, playerName });
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

    return { roomId, playerId, removed: false, room };
  }

  reassignHost(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return;
    const connected = room.players.find(p => p.connected);
    if (connected) room.hostPlayerId = connected.playerId;
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
