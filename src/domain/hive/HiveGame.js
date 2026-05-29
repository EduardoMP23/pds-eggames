'use strict';

const { key, parseKey, neighbors, toBoardMap } = require('./HiveBoard');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 2;

function initState(players) {
  return {
    board: {},
    players: [
      {
        playerId:   players[0].playerId,
        playerName: players[0].playerName,
        color: 'white',
        hand: { queen: 1, beetle: 2, grasshopper: 3, spider: 2, ant: 3 }
      },
      {
        playerId:   players[1].playerId,
        playerName: players[1].playerName,
        color: 'black',
        hand: { queen: 1, beetle: 2, grasshopper: 3, spider: 2, ant: 3 }
      }
    ],
    moveNumber: 0,
    status: 'playing',
    winner: null
  };
}

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

function applyAction(state, action, playerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) return { error: 'Player not found' };
  if (state.status !== 'playing') return { error: 'Game is not in progress' };

  const player = state.players[playerIndex];
  const events = [];

  if (action.type === 'place') {
    const { piece, q, r, s } = action;
    if (!player.hand[piece] || player.hand[piece] <= 0) return { error: 'No such piece in hand' };

    player.hand[piece]--;
    const k = key(q, r, s);
    if (!state.board[k]) state.board[k] = [];
    state.board[k].push({ piece, playerIndex, playerId });

  } else if (action.type === 'move') {
    const { fromQ, fromR, fromS, toQ, toR, toS } = action;
    const fromK = key(fromQ, fromR, fromS);
    const toK   = key(toQ, toR, toS);
    if (!state.board[fromK] || state.board[fromK].length === 0) return { error: 'No piece at source' };
    const piece = state.board[fromK].pop();
    if (state.board[fromK].length === 0) delete state.board[fromK];
    if (!state.board[toK]) state.board[toK] = [];
    state.board[toK].push(piece);

  } else {
    return { error: 'Unknown action type' };
  }

  // Check win condition
  const updatedBoard = toBoardMap(state.board);
  const p0Surrounded = checkQueenSurrounded(updatedBoard, 0);
  const p1Surrounded = checkQueenSurrounded(updatedBoard, 1);

  if (p0Surrounded && p1Surrounded) {
    state.status = 'draw';
    return { events, gameOver: true, winner: null, reason: 'Empate! Ambas as rainhas cercadas.' };
  }
  if (p0Surrounded) {
    state.status = 'finished';
    state.winner = state.players[1].playerId;
    return { events, gameOver: true, winner: state.players[1].playerId, winnerName: state.players[1].playerName };
  }
  if (p1Surrounded) {
    state.status = 'finished';
    state.winner = state.players[0].playerId;
    return { events, gameOver: true, winner: state.players[0].playerId, winnerName: state.players[0].playerName };
  }

  state.moveNumber++;
  return { events };
}

function getPublicState(state, forPlayerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === forPlayerId);
  return {
    board: state.board,
    players: state.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      color:      p.color,
      hand:       p.hand
    })),
    myPlayerIndex: playerIndex,
    moveNumber:    state.moveNumber,
    status:        state.status,
    winner:        state.winner,
    legalMoves:    []
  };
}

module.exports = { MIN_PLAYERS, MAX_PLAYERS, initState, applyAction, getPublicState };
