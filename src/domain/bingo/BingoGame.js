'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 50;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A cartela é um array plano de 24 números, renderizado num grid 5x5 (centro
// livre). Cada coluna recebe números de uma faixa fixa (1–100 ÷ 5 = 20 por coluna):
//   coluna 1: 1–20 · coluna 2: 21–40 · coluna 3: 41–60 · coluna 4: 61–80 · coluna 5: 81–100
// COLUMN_INDICES[c] lista os índices do array plano de cada coluna, de cima para
// baixo (a coluna 3 tem 4 células porque o centro do grid é "livre").
const COLUMN_INDICES = [
  [0, 5, 10, 14, 19],   // coluna 1
  [1, 6, 11, 15, 20],   // coluna 2
  [2, 7, 16, 21],       // coluna 3 (centro livre)
  [3, 8, 12, 17, 22],   // coluna 4
  [4, 9, 13, 18, 23],   // coluna 5
];

function pickFromRange(min, max, count) {
  const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return shuffle(range).slice(0, count).sort((a, b) => a - b);
}

function generateCard() {
  const card = new Array(24);
  for (let c = 0; c < COLUMN_INDICES.length; c++) {
    const idxs = COLUMN_INDICES[c];
    const nums = pickFromRange(c * 20 + 1, c * 20 + 20, idxs.length);
    idxs.forEach((ci, k) => { card[ci] = nums[k]; });
  }
  return card;
}

function initState(players) {
  const cards = {};
  for (const p of players) {
    cards[p.playerId] = generateCard();
  }
  return {
    players:       players.map(p => ({ playerId: p.playerId, playerName: p.playerName })),
    cards,
    pool:          shuffle(Array.from({ length: 100 }, (_, i) => i + 1)),
    drawnNumbers:  [],
    currentNumber: null,
    status:        'playing',
    winner:        null,
    winnerName:    null,
    invalidBingo:  null,
  };
}

function applyAction(state, action, playerId) {
  if (action.type === 'draw-number') {
    if (state.pool.length === 0) return { error: 'Todos os números já foram sorteados' };
    const num = state.pool.pop();
    state.drawnNumbers.push(num);
    state.currentNumber = num;
    state.invalidBingo  = null;
    return {};
  }

  if (action.type === 'call-bingo') {
    if (state.status === 'finished') return { error: 'Jogo encerrado' };
    const card = state.cards[playerId];
    if (!card) return { error: 'Jogador não encontrado' };
    const drawn   = new Set(state.drawnNumbers);
    const isValid = card.every(n => drawn.has(n));
    const player  = state.players.find(p => p.playerId === playerId);
    if (isValid) {
      state.status    = 'finished';
      state.winner    = playerId;
      state.winnerName = player ? player.playerName : playerId;
      return { gameOver: true, winner: state.winner, winnerName: state.winnerName, reason: 'Cartela completa!' };
    }
    state.invalidBingo = { playerId, playerName: player ? player.playerName : playerId };
    return {};
  }

  if (action.type === 'reset') {
    const fresh = initState(state.players);
    Object.assign(state, fresh);
    return { events: ['Jogo reiniciado'] };
  }

  return { error: 'Ação desconhecida' };
}

// Saída individual: cancela a cartela do jogador; o sorteio continua.
function removePlayer(state, playerId) {
  delete state.cards[playerId];
  state.players = state.players.filter(p => p.playerId !== playerId);
}

function getPublicState(state, forPlayerId, hostPlayerId) {
  return {
    myPlayerId:    forPlayerId,
    hostPlayerId:  hostPlayerId ?? null,
    players:       state.players.map(p => ({ playerId: p.playerId, playerName: p.playerName })),
    myCard:        state.cards[forPlayerId] ?? [],
    drawnNumbers:  state.drawnNumbers,
    currentNumber: state.currentNumber,
    poolRemaining: state.pool.length,
    status:        state.status,
    winner:        state.winner,
    winnerName:    state.winnerName,
    invalidBingo:  state.invalidBingo,
  };
}

module.exports = { MIN_PLAYERS, MAX_PLAYERS, initState, applyAction, getPublicState, removePlayer };
