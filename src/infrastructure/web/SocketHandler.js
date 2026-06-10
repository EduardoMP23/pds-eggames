'use strict';

const HiveGame       = require('../../domain/hive/HiveGame');
const CoupGame       = require('../../domain/coup/CoupGame');
const ItoGame        = require('../../domain/ito/ItoGame');
const PokerGame      = require('../../domain/poker/PokerGame');
const UnoGame        = require('../../domain/uno/UnoGame');
const BingoGame      = require('../../domain/bingo/BingoGame');
const PiorAmigoGame  = require('../../domain/pioramigo/PiorAmigoGame');
const PifeGame       = require('../../domain/pife/PifeGame');

const GAME_CONFIGS = {
  hive:       { minPlayers: HiveGame.MIN_PLAYERS,      maxPlayers: HiveGame.MAX_PLAYERS      },
  coup:       { minPlayers: CoupGame.MIN_PLAYERS,      maxPlayers: CoupGame.MAX_PLAYERS      },
  ito:        { minPlayers: ItoGame.MIN_PLAYERS,       maxPlayers: ItoGame.MAX_PLAYERS       },
  poker:      { minPlayers: PokerGame.MIN_PLAYERS,     maxPlayers: PokerGame.MAX_PLAYERS     },
  uno:        { minPlayers: UnoGame.MIN_PLAYERS,       maxPlayers: UnoGame.MAX_PLAYERS       },
  bingo:      { minPlayers: BingoGame.MIN_PLAYERS,     maxPlayers: BingoGame.MAX_PLAYERS     },
  pioramigo:  { minPlayers: PiorAmigoGame.MIN_PLAYERS, maxPlayers: PiorAmigoGame.MAX_PLAYERS },
  pife:       { minPlayers: PifeGame.MIN_PLAYERS,      maxPlayers: PifeGame.MAX_PLAYERS      },
};

const DEFAULT_GAME_ID = 'hive';

/**
 * SocketHandler — inbound adapter that maps Socket.io events to application use-cases.
 */
class SocketHandler {
  constructor(io, roomService, gameService, eventBus) {
    this._io         = io;
    this._rooms      = roomService;
    this._game       = gameService;
    this._bus        = eventBus;
    this._hostTimers = new Map(); // key: `${roomId}:${playerId}`
  }

  register() {
    this._io.on('connection', socket => {
      console.log('Client connected:', socket.id);

      // ── Create room ───────────────────────────────────────────────────────
      socket.on('room:create', ({ playerName, gameId, avatar, color }) => {
        const gid = GAME_CONFIGS[gameId] ? gameId : DEFAULT_GAME_ID;
        const { minPlayers, maxPlayers } = GAME_CONFIGS[gid];
        const { room, playerId } = this._rooms.createRoom(socket.id, playerName, gid, minPlayers, maxPlayers, avatar, color);
        socket.join(room.roomId);
        socket.emit('room:created', {
          roomId:       room.roomId,
          playerId,
          playerName,
          gameId:       gid,
          players:      this._playerList(room),
          isHost:       true,
          hostPlayerId: room.hostPlayerId,
          minPlayers:   room.minPlayers,
          maxPlayers:   room.maxPlayers,
        });
      });

      // ── Join / reconnect ──────────────────────────────────────────────────
      socket.on('room:join', ({ roomId, playerName, avatar, color, playerId: existingPlayerId }) => {
        const result = this._rooms.joinRoom(socket.id, playerName, roomId, avatar, color, existingPlayerId);
        if (result.error) return socket.emit('room:join-error', { message: result.error });

        const { room, playerId, reconnected } = result;
        if (reconnected) {
          const timerKey = `${roomId}:${playerId}`;
          if (this._hostTimers.has(timerKey)) {
            clearTimeout(this._hostTimers.get(timerKey));
            this._hostTimers.delete(timerKey);
          }
        }
        socket.join(roomId);

        const playerList = this._playerList(room);
        socket.emit('room:joined', {
          roomId,
          playerId,
          playerName,
          gameId:       room.gameId,
          players:      playerList,
          isHost:       room.hostPlayerId === playerId,
          hostPlayerId: room.hostPlayerId,
          status:       room.status,
          minPlayers:   room.minPlayers,
          maxPlayers:   room.maxPlayers,
        });

        if (room.status === 'playing' && room.gameState) {
          this._game.reconnect(room, playerId, socket.id);
        }

        socket.to(roomId).emit('lobby:player-joined', {
          newPlayerId: playerId,
          playerName,
          players:     playerList,
          newHostId:   room.hostPlayerId,
        });
      });

      // ── Ready toggle ──────────────────────────────────────────────────────
      socket.on('lobby:ready', ({ roomId, ready }) => {
        const info = this._rooms.getPlayerInfo(socket.id);
        if (!info) return;
        const room = this._rooms.getRoom(roomId);
        if (!room || room.status !== 'lobby') return;
        const player = room.players.find(p => p.playerId === info.playerId);
        if (player) player.ready = !!ready;
        const playerList = this._playerList(room);
        this._io.to(roomId).emit('lobby:ready-update', { players: playerList });
      });

      // ── Start game (host only) ────────────────────────────────────────────
      socket.on('lobby:start', ({ roomId }) => {
        const result = this._game.startGame(roomId, socket.id);
        if (result.error) socket.emit('room:join-error', { message: result.error });
      });

      // ── In-game action ────────────────────────────────────────────────────
      socket.on('game:action', ({ roomId, action }) => {
        const result = this._game.handleAction(socket.id, roomId, action);
        if (result.error) {
          socket.emit('game:action-error', { message: result.error });
        } else {
          const ANIM_ACTIONS = ['return-card-to-deck', 'ambassador-start', 'play-card', 'draw-card', 'call-bingo'];
          const PIFE_ANIM    = ['draw-stock', 'draw-discard', 'discard'];
          if (ANIM_ACTIONS.includes(action.type) || PIFE_ANIM.includes(action.type)) {
            const info = this._rooms.getPlayerInfo(socket.id);
            if (info) {
              const payload = { type: action.type, playerId: info.playerId };
              if (action.type === 'call-bingo') payload.playerName = info.playerName;
              if (result.animCard) payload.card = result.animCard;
              this._io.to(roomId).emit('game:animate', payload);
            }
          }
        }
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

        // Broadcast immediately — if host, newHostId still points to them (DC + HOST badge during grace period)
        this._bus.toRoom(roomId, 'lobby:player-left', {
          playerId,
          players:   this._playerList(updatedRoom),
          newHostId: updatedRoom.hostPlayerId,
        });

        const isHostLeaving =
          updatedRoom.status === 'lobby' &&
          updatedRoom.hostPlayerId === playerId;

        if (isHostLeaving) {
          const timerKey = `${roomId}:${playerId}`;
          if (this._hostTimers.has(timerKey)) clearTimeout(this._hostTimers.get(timerKey));
          this._hostTimers.set(timerKey, setTimeout(() => {
            this._hostTimers.delete(timerKey);
            const room = this._rooms.getRoom(roomId);
            if (!room || room.status !== 'lobby') return;
            const currentHost = room.players.find(p => p.playerId === playerId);
            if (currentHost?.connected) return;
            this._rooms.reassignHost(roomId);
            const refreshed = this._rooms.getRoom(roomId);
            if (refreshed) {
              this._bus.toRoom(roomId, 'lobby:host-changed', {
                newHostId: refreshed.hostPlayerId,
                players:   this._playerList(refreshed),
              });
            }
          }, 8_000));
        }
      });
    });
  }

  _playerList(room) {
    return room.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      connected:  p.connected,
      avatar:     p.avatar || null,
      color:      p.color  || null,
      ready:      p.ready  || false,
    }));
  }
}

module.exports = SocketHandler;
