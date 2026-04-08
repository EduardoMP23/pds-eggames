'use strict';

const HiveGame = require('../domain/hive/HiveGame');
const CoupGame = require('../domain/coup/CoupGame');
const ItoGame  = require('../domain/ito/ItoGame');

const GAME_REGISTRY = {
  hive: HiveGame,
  coup: CoupGame,
  ito:  ItoGame,
};

/**
 * GameService — application use-cases for in-game interactions.
 *
 * Orchestrates domain game modules and delegates I/O to the injected ports:
 *   - RoomRepositoryPort  for reading / mutating room state
 *   - EventBusPort        for broadcasting updates to connected clients
 */
class GameService {
  /**
   * @param {import('./ports/RoomRepositoryPort')} roomRepository
   * @param {import('./ports/EventBusPort')}       eventBus
   */
  constructor(roomRepository, eventBus) {
    this._repo = roomRepository;
    this._bus  = eventBus;
  }

  _getGame(gameId) {
    const game = GAME_REGISTRY[gameId];
    if (!game) throw new Error(`Unknown gameId: ${gameId}`);
    return game;
  }

  // ── Use case: start a game ──────────────────────────────────────────────────

  startGame(roomId, hostSocketId) {
    const playerInfo = this._repo.getPlayerInfo(hostSocketId);
    if (!playerInfo) return { error: 'Player not found' };

    const room = this._repo.getRoom(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.hostPlayerId !== playerInfo.playerId) return { error: 'Only the host can start the game' };

    const Game = this._getGame(room.gameId);
    const connected = room.players.filter(p => p.connected);
    if (connected.length < Game.MIN_PLAYERS) {
      return { error: `Need at least ${Game.MIN_PLAYERS} players to start` };
    }
    if (connected.length > Game.MAX_PLAYERS) {
      return { error: `Maximum ${Game.MAX_PLAYERS} players allowed` };
    }

    room.gameState = Game.initState(
      connected.map(p => ({ playerId: p.playerId, playerName: p.playerName }))
    );
    room.status = 'playing';

    this._bus.toRoom(roomId, 'game:start', { gameId: room.gameId, roomId });
    this._bus.broadcastGameState(room, playerId => Game.getPublicState(room.gameState, playerId));
    return {};
  }

  // ── Use case: handle a player action ───────────────────────────────────────

  handleAction(socketId, roomId, action) {
    const playerInfo = this._repo.getPlayerInfo(socketId);
    if (!playerInfo) return { error: 'Player not found' };

    const room = this._repo.getRoom(roomId);
    if (!room || room.status !== 'playing') return { error: 'Game not in progress' };

    const Game = this._getGame(room.gameId);
    const result = Game.applyAction(room.gameState, action, playerInfo.playerId);
    if (result.error) return { error: result.error };

    if (result.events?.length > 0) {
      this._bus.toRoom(roomId, 'game:events', { events: result.events });
    }

    if (result.gameOver) {
      room.status = 'finished';
      this._bus.toRoom(roomId, 'game:over', {
        winner:     result.winner,
        winnerName: result.winnerName,
        reason:     result.reason,
        teamWin:    result.teamWin || false,
      });
    }

    this._bus.broadcastGameState(room, playerId => Game.getPublicState(room.gameState, playerId));
    return {};
  }

  // ── Use case: reconnect a player ────────────────────────────────────────────

  reconnect(room, playerId, socketId) {
    if (!room.gameState) return;
    const Game = this._getGame(room.gameId);
    this._bus.toSocket(socketId, 'game:start', { gameId: room.gameId, roomId: room.roomId });
    this._bus.toSocket(socketId, 'game:state-update', Game.getPublicState(room.gameState, playerId));
  }
}

module.exports = GameService;
