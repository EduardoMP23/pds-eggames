'use strict';

/**
 * GameService — application use-cases for in-game interactions.
 *
 * Orchestrates the domain (HiveGame) and delegates I/O to the injected ports:
 *   - RoomRepositoryPort  for reading / mutating room state
 *   - EventBusPort        for broadcasting updates to connected clients
 */

const HiveGame = require('../domain/hive/HiveGame');

class GameService {
  /**
   * @param {import('./ports/RoomRepositoryPort')} roomRepository
   * @param {import('./ports/EventBusPort')}       eventBus
   */
  constructor(roomRepository, eventBus) {
    this._repo = roomRepository;
    this._bus  = eventBus;
  }

  // ── Use case: start a game ──────────────────────────────────────────────────

  /**
   * Initialise game state for the room and broadcast the start event.
   *
   * @param {string} roomId
   * @param {string} hostSocketId  socket of the player requesting the start
   * @returns {{ error?: string }}
   */
  startGame(roomId, hostSocketId) {
    const playerInfo = this._repo.getPlayerInfo(hostSocketId);
    if (!playerInfo) return { error: 'Player not found' };

    const room = this._repo.getRoom(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.hostPlayerId !== playerInfo.playerId) return { error: 'Only the host can start the game' };

    const connected = room.players.filter(p => p.connected);
    if (connected.length < HiveGame.MIN_PLAYERS) {
      return { error: `Need at least ${HiveGame.MIN_PLAYERS} players to start` };
    }

    room.gameState = HiveGame.initState(
      connected.map(p => ({ playerId: p.playerId, playerName: p.playerName }))
    );
    room.status = 'playing';

    this._bus.toRoom(roomId, 'game:start', { gameId: 'hive', roomId });
    this._bus.broadcastGameState(room, playerId => HiveGame.getPublicState(room.gameState, playerId));

    return {};
  }

  // ── Use case: handle a player action ───────────────────────────────────────

  /**
   * Validate and apply one game action, then broadcast the updated state.
   *
   * @param {string} socketId
   * @param {string} roomId
   * @param {{ type: string, [key: string]: any }} action
   * @returns {{ error?: string }}
   */
  handleAction(socketId, roomId, action) {
    const playerInfo = this._repo.getPlayerInfo(socketId);
    if (!playerInfo) return { error: 'Player not found' };

    const room = this._repo.getRoom(roomId);
    if (!room || room.status !== 'playing') return { error: 'Game not in progress' };

    const result = HiveGame.applyAction(room.gameState, action, playerInfo.playerId);
    if (result.error) return { error: result.error };

    if (result.events?.length > 0) {
      this._bus.toRoom(roomId, 'game:events', { events: result.events });
    }

    if (result.gameOver) {
      room.status = 'finished';
      this._bus.toRoom(roomId, 'game:over', {
        winner:     result.winner,
        winnerName: result.winnerName,
        reason:     result.reason
      });
    }

    this._bus.broadcastGameState(room, playerId => HiveGame.getPublicState(room.gameState, playerId));
    return {};
  }

  // ── Use case: reconnect a player ────────────────────────────────────────────

  /**
   * Resend the current game state to a reconnecting player's new socket.
   *
   * @param {Object} room
   * @param {string} playerId
   * @param {string} socketId  the player's new socket ID
   */
  reconnect(room, playerId, socketId) {
    if (!room.gameState) return;
    this._bus.toSocket(socketId, 'game:start', { gameId: 'hive', roomId: room.roomId });
    this._bus.toSocket(socketId, 'game:state-update', HiveGame.getPublicState(room.gameState, playerId));
  }
}

module.exports = GameService;
