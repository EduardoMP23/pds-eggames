'use strict';

const HiveGame       = require('../domain/hive/HiveGame');
const CoupGame       = require('../domain/coup/CoupGame');
const ItoGame        = require('../domain/ito/ItoGame');
const PokerGame      = require('../domain/poker/PokerGame');
const UnoGame        = require('../domain/uno/UnoGame');
const BingoGame      = require('../domain/bingo/BingoGame');
const PiorAmigoGame  = require('../domain/pioramigo/PiorAmigoGame');
const PifeGame       = require('../domain/pife/PifeGame');

const GAME_REGISTRY = {
  hive:       HiveGame,
  coup:       CoupGame,
  ito:        ItoGame,
  poker:      PokerGame,
  uno:        UnoGame,
  bingo:      BingoGame,
  pioramigo:  PiorAmigoGame,
  pife:       PifeGame,
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
    this._repo           = roomRepository;
    this._bus            = eventBus;
    this._bingoTimers    = new Map(); // roomId → intervalId for auto-draw
    this._readingTimers  = new Map(); // roomId → timeoutId for pioramigo reading phase
  }

  _getGame(gameId) {
    const game = GAME_REGISTRY[gameId];
    if (!game) throw new Error(`Unknown gameId: ${gameId}`);
    return game;
  }

  // ── Use case: start a game ──────────────────────────────────────────────────

  startGame(roomId, hostSocketId, settings) {
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
    const nonHostReady = connected.filter(p => p.playerId !== room.hostPlayerId);
    if (nonHostReady.some(p => !p.ready)) {
      return { error: 'Nem todos os jogadores estão prontos' };
    }

    // Pré-configurações escolhidas pelo host (ex.: valor inicial da banca no Poker).
    // Mantidas em memória na sala para que o reset reuse a mesma config.
    room.settings = settings || room.settings || {};
    room.gameState = Game.initState(
      connected.map(p => ({ playerId: p.playerId, playerName: p.playerName, avatar: p.avatar || null, color: p.color || null })),
      room.settings
    );
    room.status = 'playing';

    this._bus.toRoom(roomId, 'game:start', { gameId: room.gameId, roomId });
    this._bus.broadcastGameState(room, playerId => Game.getPublicState(room.gameState, playerId, room.hostPlayerId));
    if (room.gameId === 'bingo')      this._startBingoTimer(roomId);
    if (room.gameId === 'pioramigo')  this._startReadingTimer(roomId);
    return {};
  }

  // ── Use case: handle a player action ───────────────────────────────────────

  handleAction(socketId, roomId, action) {
    const playerInfo = this._repo.getPlayerInfo(socketId);
    if (!playerInfo) return { error: 'Player not found' };

    const room = this._repo.getRoom(roomId);
    if (!room) return { error: 'Room not found' };

    const Game = this._getGame(room.gameId);

    // ── Reset ──────────────────────────────────────────────────────────────
    if (action.type === 'reset') {
      if (!['playing', 'finished'].includes(room.status)) return { error: 'Jogo não iniciado' };
      if (room.hostPlayerId !== playerInfo.playerId) return { error: 'Apenas o criador da sala pode reiniciar a partida' };

      const connected = room.players.filter(p => p.connected);
      room.gameState = Game.initState(
        connected.map(p => ({ playerId: p.playerId, playerName: p.playerName, avatar: p.avatar || null, color: p.color || null })),
        room.settings || {}
      );
      room.status = 'playing';
      room.players.forEach(p => { p.ready = false; });
      this._bus.toRoom(roomId, 'game:reset', {});
      this._bus.broadcastGameState(room, playerId => Game.getPublicState(room.gameState, playerId, room.hostPlayerId));
      if (room.gameId === 'bingo')      this._startBingoTimer(roomId);
      if (room.gameId === 'pioramigo')  this._startReadingTimer(roomId);
      return {};
    }

    // ── Leave ──────────────────────────────────────────────────────────────
    if (action.type === 'leave') {
      if (!['playing', 'finished'].includes(room.status)) return {};

      // Jogos que exportam removePlayer suportam saída individual: só quem
      // clicou sai da partida; a mesa continua para os demais.
      if (typeof Game.removePlayer === 'function') {
        let result = {};
        if (room.gameState) result = Game.removePlayer(room.gameState, playerInfo.playerId) || {};
        this._repo.leaveRoom(socketId);
        this._bus.toSocket(socketId, 'game:left', {});

        if (room.players.length === 0) {
          // mesa vazia: sala volta ao lobby (cleanup do repositório cuida do resto)
          this._clearBingoTimer(roomId);
          this._clearReadingTimer(roomId);
          room.status = 'lobby';
          room.gameState = null;
          return {};
        }

        // a remoção pode decidir a partida (ex.: Coup/Poker com 1 restante)
        if (result.gameOver) {
          room.players.forEach(p => { p.ready = false; });
          room.status = 'finished';
          this._bus.toRoom(roomId, 'game:over', {
            winner:     result.winner,
            winnerName: result.winnerName,
            reason:     result.reason,
            teamWin:    result.teamWin || false,
          });
        }

        if (room.gameState) {
          this._bus.broadcastGameState(room, playerId => Game.getPublicState(room.gameState, playerId, room.hostPlayerId));
        }
        return {};
      }

      // Comportamento padrão: sala inteira volta ao lobby
      this._clearBingoTimer(roomId);
      this._clearReadingTimer(roomId);
      room.status = 'lobby';
      room.gameState = null;
      room.players.forEach(p => { p.ready = false; });
      this._bus.toRoom(roomId, 'game:back-to-lobby', {});
      return {};
    }

    // ── Normal game action ─────────────────────────────────────────────────
    if (room.status !== 'playing') return { error: 'Game not in progress' };

    const result = Game.applyAction(room.gameState, action, playerInfo.playerId);
    if (result.error) return { error: result.error };

    if (result.events?.length > 0) {
      this._bus.toRoom(roomId, 'game:events', { events: result.events });
    }

    if (result.gameOver) {
      room.players.forEach(p => { p.ready = false; });
      room.status = 'finished';
      this._bus.toRoom(roomId, 'game:over', {
        winner:     result.winner,
        winnerName: result.winnerName,
        reason:     result.reason,
        teamWin:    result.teamWin || false,
      });
    }

    this._bus.broadcastGameState(room, playerId => Game.getPublicState(room.gameState, playerId, room.hostPlayerId));

    // restart reading timer when pioramigo advances to a new reading phase
    if (room.gameId === 'pioramigo' && result.advancedToReading) {
      this._startReadingTimer(roomId);
    }

    return { animCard: result.animCard || null };
  }

  // ── Pior Amigo reading-phase timer ────────────────────────────────────────

  _startReadingTimer(roomId) {
    this._clearReadingTimer(roomId);
    const id = setTimeout(() => {
      const room = this._repo.getRoom(roomId);
      if (!room || room.status !== 'playing' || !room.gameState) return;
      const Game = this._getGame(room.gameId);
      Game.applyAction(room.gameState, { type: '_advance-accepting' }, null);
      this._bus.broadcastGameState(room, pid => Game.getPublicState(room.gameState, pid, room.hostPlayerId));
      this._readingTimers.delete(roomId);
    }, 10000);
    this._readingTimers.set(roomId, id);
  }

  _clearReadingTimer(roomId) {
    const id = this._readingTimers.get(roomId);
    if (id !== undefined) {
      clearTimeout(id);
      this._readingTimers.delete(roomId);
    }
  }

  // ── Bingo auto-draw timer ──────────────────────────────────────────────────

  _startBingoTimer(roomId) {
    this._clearBingoTimer(roomId);
    const timeoutId = setTimeout(() => {
      this._serverBingoDraw(roomId);
      const id = setInterval(() => this._serverBingoDraw(roomId), 10000);
      this._bingoTimers.set(roomId, id);
    }, 5000);
    this._bingoTimers.set(roomId, timeoutId);
  }

  _clearBingoTimer(roomId) {
    const id = this._bingoTimers.get(roomId);
    if (id !== undefined) {
      clearTimeout(id);
      clearInterval(id);
      this._bingoTimers.delete(roomId);
    }
  }

  _serverBingoDraw(roomId) {
    const room = this._repo.getRoom(roomId);
    if (!room || room.status !== 'playing' || !room.gameState) {
      this._clearBingoTimer(roomId);
      return;
    }

    const Game   = this._getGame(room.gameId);
    const result = Game.applyAction(room.gameState, { type: 'draw-number' }, null);

    if (result.error) {
      this._clearBingoTimer(roomId);
      return;
    }

    if (result.gameOver) {
      room.players.forEach(p => { p.ready = false; });
      room.status = 'finished';
      this._bus.toRoom(roomId, 'game:over', {
        winner:     result.winner,
        winnerName: result.winnerName,
        reason:     result.reason,
        teamWin:    result.teamWin || false,
      });
      this._clearBingoTimer(roomId);
    }

    this._bus.broadcastGameState(
      room,
      playerId => Game.getPublicState(room.gameState, playerId, room.hostPlayerId)
    );

    if (room.gameState.pool.length === 0) {
      this._clearBingoTimer(roomId);
    }
  }

  // ── Use case: reconnect a player ────────────────────────────────────────────

  reconnect(room, playerId, socketId) {
    if (!room.gameState) return;
    const Game = this._getGame(room.gameId);
    this._bus.toSocket(socketId, 'game:start', { gameId: room.gameId, roomId: room.roomId });
    this._bus.toSocket(socketId, 'game:state-update', Game.getPublicState(room.gameState, playerId, room.hostPlayerId));
  }
}

module.exports = GameService;
