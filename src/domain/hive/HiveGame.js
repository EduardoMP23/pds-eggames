'use strict';

/**
 * HiveGame — domain aggregate root for a Hive game session.
 *
 * Responsibilities:
 *   - Initialise game state
 *   - Validate and apply player actions
 *   - Derive per-player public views of the state
 *   - Detect win / draw conditions
 *
 * Pure module: no I/O, no side-effects, no external dependencies beyond
 * the other Hive domain modules.
 */

const { key, parseKey, neighbors, toBoardMap } = require('./HiveBoard');
const { getLegalMoves } = require('./HiveMoves');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 2;

// ── State factory ─────────────────────────────────────────────────────────────

/**
 * @param {{ playerId: string, playerName: string }[]} players
 * @returns {Object} initial game state
 */
function initState(players) {
  return {
    board: {},
    players: [
      {
        playerId: players[0].playerId,
        playerName: players[0].playerName,
        color: 'white',
        queenPlaced: false,
        hand: { queen: 1, beetle: 2, grasshopper: 3, spider: 2, ant: 3 }
      },
      {
        playerId: players[1].playerId,
        playerName: players[1].playerName,
        color: 'black',
        queenPlaced: false,
        hand: { queen: 1, beetle: 2, grasshopper: 3, spider: 2, ant: 3 }
      }
    ],
    currentTurnIndex: 0,
    moveNumber: 0,
    status: 'playing',
    winner: null
  };
}

// ── Win condition ─────────────────────────────────────────────────────────────

function checkQueenSurrounded(board, playerIndex) {
  for (const [k, stack] of board.entries()) {
    const top = stack[stack.length - 1];
    if (top.playerIndex === playerIndex && top.piece === 'queen') {
      const { q, r, s } = parseKey(k);
      return neighbors(q, r, s).every(nb => board.has(key(nb.q, nb.r, nb.s)));
    }
  }
  return false;
}

// ── Action application ────────────────────────────────────────────────────────

/**
 * Validates and applies one player action, mutating state in-place.
 *
 * @param {Object} state    mutable game state
 * @param {{ type: string, [key: string]: any }} action
 * @param {string} playerId
 * @returns {{ events: string[], gameOver?: boolean, winner?: string|null, winnerName?: string, reason?: string, error?: string }}
 */
function applyAction(state, action, playerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) return { error: 'Player not found' };
  if (state.status !== 'playing') return { error: 'Game is not in progress' };
  if (state.currentTurnIndex !== playerIndex) return { error: 'Not your turn' };

  const player = state.players[playerIndex];
  const events = [];

  if (action.type === 'place') {
    const { piece, q, r, s } = action;
    if (!player.hand[piece] || player.hand[piece] <= 0) return { error: 'No such piece in hand' };

    const legalMoves = getLegalMoves(state, playerIndex);
    const isLegal = legalMoves.some(
      m => m.type === 'place' && m.piece === piece && m.q === q && m.r === r && m.s === s
    );
    if (!isLegal) return { error: 'Illegal placement' };

    player.hand[piece]--;
    if (piece === 'queen') player.queenPlaced = true;

    const k = key(q, r, s);
    if (!state.board[k]) state.board[k] = [];
    state.board[k].push({ piece, playerIndex, playerId });
    events.push(`${player.playerName} places ${piece} at (${q},${r},${s})`);

  } else if (action.type === 'move') {
    const { fromQ, fromR, fromS, toQ, toR, toS } = action;

    const legalMoves = getLegalMoves(state, playerIndex);
    const isLegal = legalMoves.some(
      m => m.type === 'move' &&
        m.fromQ === fromQ && m.fromR === fromR && m.fromS === fromS &&
        m.toQ === toQ && m.toR === toR && m.toS === toS
    );
    if (!isLegal) return { error: 'Illegal move' };

    const fromK = key(fromQ, fromR, fromS);
    const toK = key(toQ, toR, toS);
    const piece = state.board[fromK].pop();
    if (state.board[fromK].length === 0) delete state.board[fromK];
    if (!state.board[toK]) state.board[toK] = [];
    state.board[toK].push(piece);
    events.push(`${player.playerName} moves ${piece.piece} to (${toQ},${toR},${toS})`);

  } else {
    return { error: 'Unknown action type' };
  }

  const updatedBoard = toBoardMap(state.board);
  const p0Surrounded = checkQueenSurrounded(updatedBoard, 0);
  const p1Surrounded = checkQueenSurrounded(updatedBoard, 1);

  if (p0Surrounded && p1Surrounded) {
    state.status = 'draw';
    events.push('Draw! Both queens are surrounded!');
    return { events, gameOver: true, winner: null, reason: 'draw' };
  }
  if (p0Surrounded) {
    state.status = 'finished';
    state.winner = state.players[1].playerId;
    events.push(`${state.players[1].playerName} wins! White queen is surrounded!`);
    return { events, gameOver: true, winner: state.players[1].playerId, winnerName: state.players[1].playerName };
  }
  if (p1Surrounded) {
    state.status = 'finished';
    state.winner = state.players[0].playerId;
    events.push(`${state.players[0].playerName} wins! Black queen is surrounded!`);
    return { events, gameOver: true, winner: state.players[0].playerId, winnerName: state.players[0].playerName };
  }

  state.currentTurnIndex = 1 - state.currentTurnIndex;
  state.moveNumber++;
  return { events };
}

// ── Public state projection ───────────────────────────────────────────────────

/**
 * Returns a player-specific view of the game state (legal moves only for the
 * active player; hands are public in Hive).
 *
 * @param {Object} state
 * @param {string} forPlayerId
 * @returns {Object}
 */
function getPublicState(state, forPlayerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === forPlayerId);
  const legalMoves =
    state.status === 'playing' && playerIndex === state.currentTurnIndex
      ? getLegalMoves(state, playerIndex)
      : [];

  return {
    board: state.board,
    players: state.players.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      color: p.color,
      queenPlaced: p.queenPlaced,
      hand: p.hand
    })),
    currentTurnIndex: state.currentTurnIndex,
    currentTurnPlayerId: state.players[state.currentTurnIndex]?.playerId,
    isMyTurn: state.players[state.currentTurnIndex]?.playerId === forPlayerId,
    myPlayerIndex: playerIndex,
    moveNumber: state.moveNumber,
    status: state.status,
    winner: state.winner,
    legalMoves
  };
}

module.exports = { MIN_PLAYERS, MAX_PLAYERS, initState, applyAction, getPublicState };
