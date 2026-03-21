'use strict';

const { MIN_PLAYERS, MAX_PLAYERS } = require('../../domain/hive/HiveGame');

/**
 * SocketHandler — inbound adapter that maps Socket.io events to application use-cases.
 *
 * This class is the only place in the backend that knows about socket IDs and
 * Socket.io event names.  It translates raw socket events into calls on
 * RoomService / GameService and delegates all broadcasting to SocketIOEventBus.
 */
class SocketHandler {
  /**
   * @param {import('socket.io').Server}                            io
   * @param {import('../../application/RoomService')}               roomService
   * @param {import('../../application/GameService')}               gameService
   * @param {import('../events/SocketIOEventBus')}                  eventBus
   */
  constructor(io, roomService, gameService, eventBus) {
    this._io    = io;
    this._rooms = roomService;
    this._game  = gameService;
    this._bus   = eventBus;
  }

  /** Attach all Socket.io event listeners. Call once after server setup. */
  register() {
    this._io.on('connection', socket => {
      console.log('Client connected:', socket.id);

      // ── Create room ───────────────────────────────────────────────────────
      socket.on('room:create', ({ playerName }) => {
        const { room, playerId } = this._rooms.createRoom(
          socket.id, playerName, MIN_PLAYERS, MAX_PLAYERS
        );
        socket.join(room.roomId);
        socket.emit('room:created', {
          roomId:     room.roomId,
          playerId,
          playerName,
          gameId:     'hive',
          players:    this._playerList(room),
          isHost:     true,
          minPlayers: room.minPlayers,
          maxPlayers: room.maxPlayers
        });
      });

      // ── Join / reconnect ──────────────────────────────────────────────────
      socket.on('room:join', ({ roomId, playerName }) => {
        const result = this._rooms.joinRoom(socket.id, playerName, roomId);
        if (result.error) return socket.emit('room:join-error', { message: result.error });

        const { room, playerId, reconnected } = result;
        socket.join(roomId);

        const playerList = this._playerList(room);
        socket.emit('room:joined', {
          roomId,
          playerId,
          playerName,
          gameId:     'hive',
          players:    playerList,
          isHost:     room.hostPlayerId === playerId,
          status:     room.status,
          minPlayers: room.minPlayers,
          maxPlayers: room.maxPlayers
        });

        // Resend game state if rejoining a running game
        if (room.status === 'playing' && room.gameState) {
          this._game.reconnect(room, playerId, socket.id);
        }

        socket.to(roomId).emit('lobby:player-joined', { playerId, playerName, players: playerList });
      });

      // ── Start game (host only) ────────────────────────────────────────────
      socket.on('lobby:start', ({ roomId }) => {
        const result = this._game.startGame(roomId, socket.id);
        if (result.error) socket.emit('room:join-error', { message: result.error });
      });

      // ── In-game action ────────────────────────────────────────────────────
      socket.on('game:action', ({ roomId, action }) => {
        const result = this._game.handleAction(socket.id, roomId, action);
        if (result.error) socket.emit('game:action-error', { message: result.error });
      });

      // ── Chat ──────────────────────────────────────────────────────────────
      socket.on('chat:message', ({ roomId, text }) => {
        const info = this._rooms.getPlayerInfo(socket.id);
        if (!info) return;
        this._bus.toRoom(roomId, 'chat:message', {
          playerName: info.playerName,
          text:       text.slice(0, 200),
          timestamp:  Date.now()
        });
      });

      // ── Disconnect ────────────────────────────────────────────────────────
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const result = this._rooms.removePlayer(socket.id);
        if (!result || result.removed) return;

        const { roomId, playerId } = result;
        const updatedRoom = this._rooms.getRoom(roomId);
        if (!updatedRoom) return;

        this._bus.toRoom(roomId, 'lobby:player-left', {
          playerId,
          players:    this._playerList(updatedRoom),
          newHostId:  updatedRoom.hostPlayerId
        });
      });
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _playerList(room) {
    return room.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      connected:  p.connected
    }));
  }
}

module.exports = SocketHandler;
