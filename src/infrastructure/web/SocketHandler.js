'use strict';

const HiveGame = require('../../domain/hive/HiveGame');
const CoupGame = require('../../domain/coup/CoupGame');
const ItoGame  = require('../../domain/ito/ItoGame');

const GAME_CONFIGS = {
  hive: { minPlayers: HiveGame.MIN_PLAYERS, maxPlayers: HiveGame.MAX_PLAYERS },
  coup: { minPlayers: CoupGame.MIN_PLAYERS, maxPlayers: CoupGame.MAX_PLAYERS },
  ito:  { minPlayers: ItoGame.MIN_PLAYERS,  maxPlayers: ItoGame.MAX_PLAYERS  },
};

const DEFAULT_GAME_ID = 'hive';

/**
 * SocketHandler — inbound adapter that maps Socket.io events to application use-cases.
 */
class SocketHandler {
  constructor(io, roomService, gameService, eventBus) {
    this._io    = io;
    this._rooms = roomService;
    this._game  = gameService;
    this._bus   = eventBus;
  }

  register() {
    this._io.on('connection', socket => {
      console.log('Client connected:', socket.id);

      // ── Create room ───────────────────────────────────────────────────────
      socket.on('room:create', ({ playerName, gameId }) => {
        const gid = GAME_CONFIGS[gameId] ? gameId : DEFAULT_GAME_ID;
        const { minPlayers, maxPlayers } = GAME_CONFIGS[gid];
        const { room, playerId } = this._rooms.createRoom(socket.id, playerName, gid, minPlayers, maxPlayers);
        socket.join(room.roomId);
        socket.emit('room:created', {
          roomId:     room.roomId,
          playerId,
          playerName,
          gameId:     gid,
          players:    this._playerList(room),
          isHost:     true,
          minPlayers: room.minPlayers,
          maxPlayers: room.maxPlayers,
        });
      });

      // ── Join / reconnect ──────────────────────────────────────────────────
      socket.on('room:join', ({ roomId, playerName }) => {
        const result = this._rooms.joinRoom(socket.id, playerName, roomId);
        if (result.error) return socket.emit('room:join-error', { message: result.error });

        const { room, playerId } = result;
        socket.join(roomId);

        const playerList = this._playerList(room);
        socket.emit('room:joined', {
          roomId,
          playerId,
          playerName,
          gameId:     room.gameId,
          players:    playerList,
          isHost:     room.hostPlayerId === playerId,
          status:     room.status,
          minPlayers: room.minPlayers,
          maxPlayers: room.maxPlayers,
        });

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
          timestamp:  Date.now(),
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
          players:   this._playerList(updatedRoom),
          newHostId: updatedRoom.hostPlayerId,
        });
      });
    });
  }

  _playerList(room) {
    return room.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      connected:  p.connected,
    }));
  }
}

module.exports = SocketHandler;
