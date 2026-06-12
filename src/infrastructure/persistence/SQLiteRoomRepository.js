'use strict';

const { DatabaseSync } = require('node:sqlite');
const path             = require('path');
const fs               = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH
  || path.join(__dirname, '../../../data/rooms.db');

/**
 * SQLiteRoomRepository — implements RoomRepositoryPort using an in-memory Map
 * as the primary (fast) store, backed by SQLite for persistence across restarts.
 *
 * Strategy:
 *   - All reads/writes hit the in-memory Map (same behaviour as InMemoryRoomRepository).
 *   - A background flush syncs the Map to SQLite every 5 seconds.
 *   - On startup, rooms in 'lobby' or 'playing' status are restored from SQLite
 *     (all players start as disconnected — sockets are gone after a restart).
 *   - On SIGTERM/SIGINT, a final flush runs before the process exits.
 */
class SQLiteRoomRepository {
  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    this._db      = new DatabaseSync(DB_PATH);
    this._rooms   = new Map();  // roomId  → room
    this._players = new Map();  // socketId → { roomId, playerId, playerName }

    this._initSchema();
    this._restoreRooms();
    this._startPeriodicFlush();
  }

  // ── Schema ──────────────────────────────────────────────────────────────────

  _initSchema() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id        TEXT PRIMARY KEY,
        game_id        TEXT NOT NULL,
        host_player_id TEXT NOT NULL,
        status         TEXT NOT NULL,
        min_players    INTEGER NOT NULL,
        max_players    INTEGER NOT NULL,
        players        TEXT NOT NULL,
        game_state     TEXT,
        updated_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    `);
  }

  // ── Startup restore ─────────────────────────────────────────────────────────

  _restoreRooms() {
    const rows = this._db.prepare(
      "SELECT * FROM rooms WHERE status IN ('lobby', 'playing')"
    ).all();

    let restored = 0;
    for (const row of rows) {
      const room = this._deserialize(row);
      // Sockets are gone after a restart — mark all players disconnected.
      room.players.forEach(p => { p.connected = false; });

      // Drop rooms that have no players at all — they are orphaned.
      if (room.players.length === 0) continue;

      this._rooms.set(room.roomId, room);
      restored++;

      // Schedule cleanup for rooms that have no connected players.
      room._cleanupTimer = setTimeout(() => {
        const r = this._rooms.get(room.roomId);
        if (r && r.players.filter(p => p.connected).length === 0) {
          this._rooms.delete(room.roomId);
          console.log(`[Room] ${room.roomId} deletada por inatividade (restauração).`);
        }
      }, 30_000);
    }

    if (restored > 0) {
      console.log(`[DB] Restored ${restored} room(s) from database.`);
    }
  }

  // ── Periodic flush ──────────────────────────────────────────────────────────

  _startPeriodicFlush() {
    const interval = setInterval(() => this._flush(), 5_000);
    interval.unref(); // don't prevent process exit

    const shutdown = () => { this._flush(); };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT',  shutdown);
  }

  _flush() {
    const upsert = this._db.prepare(`
      INSERT INTO rooms
        (room_id, game_id, host_player_id, status, min_players, max_players, players, game_state, updated_at)
      VALUES
        (@roomId, @gameId, @hostPlayerId, @status, @minPlayers, @maxPlayers, @players, @gameState, @updatedAt)
      ON CONFLICT(room_id) DO UPDATE SET
        host_player_id = excluded.host_player_id,
        status         = excluded.status,
        players        = excluded.players,
        game_state     = excluded.game_state,
        updated_at     = excluded.updated_at
    `);

    const activeIds = [...this._rooms.keys()];

    try {
      this._db.exec('BEGIN');
      for (const room of this._rooms.values()) {
        upsert.run(this._serialize(room));
      }
      if (activeIds.length > 0) {
        const placeholders = activeIds.map(() => '?').join(',');
        this._db.prepare(`DELETE FROM rooms WHERE room_id NOT IN (${placeholders})`).run(...activeIds);
      } else {
        this._db.exec('DELETE FROM rooms');
      }
      this._db.exec('COMMIT');
    } catch (err) {
      this._db.exec('ROLLBACK');
      console.error('[DB] Flush error:', err.message);
    }
  }

  // ── Serialization ───────────────────────────────────────────────────────────

  _serialize(room) {
    return {
      roomId:       room.roomId,
      gameId:       room.gameId,
      hostPlayerId: room.hostPlayerId,
      status:       room.status,
      minPlayers:   room.minPlayers,
      maxPlayers:   room.maxPlayers,
      players:      JSON.stringify(room.players),
      gameState:    room.gameState ? JSON.stringify(room.gameState) : null,
      updatedAt:    Date.now(),
    };
  }

  _deserialize(row) {
    return {
      roomId:       row.room_id,
      gameId:       row.game_id,
      hostPlayerId: row.host_player_id,
      status:       row.status,
      minPlayers:   row.min_players,
      maxPlayers:   row.max_players,
      players:      JSON.parse(row.players),
      gameState:    row.game_state ? JSON.parse(row.game_state) : null,
    };
  }

  // ── RoomRepositoryPort implementation ───────────────────────────────────────

  createRoom(socketId, playerName, gameId, minPlayers, maxPlayers, avatar, color) {
    const roomId   = uuidv4().slice(0, 8);
    const playerId = uuidv4().slice(0, 8);

    const room = {
      roomId,
      gameId:       gameId || 'hive',
      hostPlayerId: playerId,
      status:       'lobby',
      players:      [{ playerId, playerName, socketId, connected: true, avatar: avatar || null, color: color || null }],
      minPlayers,
      maxPlayers,
      gameState:    null,
    };

    this._rooms.set(roomId, room);
    this._players.set(socketId, { roomId, playerId, playerName });
    return { room, playerId };
  }

  joinRoom(socketId, playerName, roomId, avatar, color, playerId) {
    const room = this._rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    // Reconnect by playerId (creator rejoining lobby) or by name if disconnected
    const existing = room.players.find(p =>
      (playerId && p.playerId === playerId) ||
      (p.playerName === playerName && !p.connected)
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
      if (existing._removeTimer) {
        clearTimeout(existing._removeTimer);
        existing._removeTimer = null;
      }
      existing.socketId  = socketId;
      existing.connected = true;
      if (avatar) existing.avatar = avatar;
      if (color)  existing.color  = color;
      existing.ready = false;
      if (room.status === 'finished') {
        room.status    = 'lobby';
        room.gameState = null;
        room.players.forEach(p => { p.ready = false; });
      }
      this._players.set(socketId, { roomId, playerId: existing.playerId, playerName });
      return { room, playerId: existing.playerId, reconnected: true };
    }

    const newPlayerId = uuidv4().slice(0, 8);
    room.players.push({ playerId: newPlayerId, playerName, socketId, connected: true, avatar: avatar || null, color: color || null });
    this._players.set(socketId, { roomId, playerId: newPlayerId, playerName });
    return { room, playerId: newPlayerId };
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
    if (player) {
      player.connected = false;

      if (room.status === 'lobby') {
        // Short grace period — allows page navigation to reconnect before removing
        player._removeTimer = setTimeout(() => {
          const r = this._rooms.get(roomId);
          if (!r) return;
          const p = r.players.find(p => p.playerId === playerId);
          if (p && !p.connected) {
            r.players = r.players.filter(p => p.playerId !== playerId);
          }
        }, 5_000);
      }
    }
    this._players.delete(socketId);

    const connectedCount = room.players.filter(p => p.connected).length;
    if (connectedCount === 0) {
      room._cleanupTimer = setTimeout(() => {
        const r = this._rooms.get(roomId);
        if (r && r.players.filter(p => p.connected).length === 0) {
          this._rooms.delete(roomId);
          console.log(`[Room] ${roomId} deletada por inatividade.`);
        }
      }, 30_000);
    }

    return { roomId, playerId, removed: false, room };
  }

  /**
   * Saída intencional: remove o jogador definitivamente do roster (sem grace
   * period de reconexão) e reatribui o host se necessário.
   */
  leaveRoom(socketId) {
    const info = this._players.get(socketId);
    if (!info) return null;

    const { roomId, playerId } = info;
    this._players.delete(socketId);

    const room = this._rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.playerId === playerId);
    if (player && player._removeTimer) {
      clearTimeout(player._removeTimer);
      player._removeTimer = null;
    }
    room.players = room.players.filter(p => p.playerId !== playerId);

    if (room.hostPlayerId === playerId) {
      const next = room.players.find(p => p.connected);
      if (next) room.hostPlayerId = next.playerId;
    }

    const connectedCount = room.players.filter(p => p.connected).length;
    if (connectedCount === 0) {
      room._cleanupTimer = setTimeout(() => {
        const r = this._rooms.get(roomId);
        if (r && r.players.filter(p => p.connected).length === 0) {
          this._rooms.delete(roomId);
          console.log(`[Room] ${roomId} deletada por inatividade.`);
        }
      }, 30_000);
    }

    return { roomId, playerId, room };
  }

  reassignHost(roomId) {
    const room = this._rooms.get(roomId);
    if (!room) return;
    const currentHost = room.players.find(p => p.playerId === room.hostPlayerId);
    if (currentHost && currentHost.connected) return;
    const next = room.players.find(p => p.connected && p.playerId !== room.hostPlayerId);
    if (next) room.hostPlayerId = next.playerId;
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
          hostName:    room.players.find(p => p.playerId === room.hostPlayerId)?.playerName,
        });
      }
    }
    return result;
  }
}

module.exports = SQLiteRoomRepository;
