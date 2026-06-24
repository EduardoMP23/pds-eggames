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

// Linhas e diagonais do grid 5x5 em índices do array plano de 24 (centro livre,
// auto-marcado, fica fora dos padrões). Usado no modo 'line'.
const ROW_INDICES = [
  [0, 1, 2, 3, 4],        // linha 1
  [5, 6, 7, 8, 9],        // linha 2
  [10, 11, 12, 13],       // linha 3 (centro livre)
  [14, 15, 16, 17, 18],   // linha 4
  [19, 20, 21, 22, 23],   // linha 5
];
const DIAGONALS = [
  [0, 6, 17, 23],         // principal ↘ (centro livre, fora)
  [4, 8, 15, 19],         // anti ↙ (centro livre, fora)
];
const LINE_PATTERNS = [...ROW_INDICES, ...COLUMN_INDICES, ...DIAGONALS];

const VALID_MODES = ['full', 'line', 'underdog'];

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

function initState(players, settings = {}) {
  const mode  = VALID_MODES.includes(settings?.mode) ? settings.mode : 'full';
  const cards = {};
  for (const p of players) {
    cards[p.playerId] = generateCard();
  }
  return {
    players:       players.map(p => ({ playerId: p.playerId, playerName: p.playerName, eliminated: false })),
    cards,
    mode,
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

    // Modo Azarão: quem tiver o número sorteado na cartela é eliminado.
    if (state.mode === 'underdog' && state.status === 'playing') {
      const before   = state.players.filter(p => !p.eliminated);
      const newlyOut  = [];
      for (const p of before) {
        const card = state.cards[p.playerId];
        if (card && card.includes(num)) {
          p.eliminated = true;
          newlyOut.push(p);
        }
      }
      const survivors = state.players.filter(p => !p.eliminated);
      // Só decide quando havia 2+ disputando e a partida chega ao fim.
      if (before.length >= 2 && survivors.length <= 1) {
        // Empate: se o último sorteio eliminou todos os restantes, eles co-vencem.
        const winners = survivors.length === 1 ? survivors : newlyOut;
        state.status     = 'finished';
        state.winner     = winners.length === 1 ? winners[0].playerId : winners.map(w => w.playerId);
        state.winnerName = winners.map(w => w.playerName).join(', ');
        return {
          gameOver:   true,
          winner:     state.winner,
          winnerName: state.winnerName,
          reason:     winners.length === 1 ? 'Último sobrevivente!' : 'Empate — eliminados juntos!',
          teamWin:    winners.length > 1,
        };
      }
    }

    return {};
  }

  if (action.type === 'call-bingo') {
    if (state.status === 'finished') return { error: 'Jogo encerrado' };
    if (state.mode === 'underdog')   return { error: 'Modo Azarão não usa BINGO.' };
    const card = state.cards[playerId];
    if (!card) return { error: 'Jogador não encontrado' };
    const drawn   = new Set(state.drawnNumbers);
    const isValid = state.mode === 'line'
      ? LINE_PATTERNS.some(pat => pat.every(i => drawn.has(card[i])))
      : card.every(n => drawn.has(n));
    const player  = state.players.find(p => p.playerId === playerId);
    if (isValid) {
      state.status    = 'finished';
      state.winner    = playerId;
      state.winnerName = player ? player.playerName : playerId;
      return {
        gameOver:   true,
        winner:     state.winner,
        winnerName: state.winnerName,
        reason:     state.mode === 'line' ? 'Linha completa!' : 'Cartela completa!',
      };
    }
    state.invalidBingo = { playerId, playerName: player ? player.playerName : playerId };
    return {};
  }

  if (action.type === 'reset') {
    const fresh = initState(state.players, { mode: state.mode });
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
  const me = state.players.find(p => p.playerId === forPlayerId);
  return {
    myPlayerId:    forPlayerId,
    hostPlayerId:  hostPlayerId ?? null,
    mode:          state.mode || 'full',
    players:       state.players.map(p => ({ playerId: p.playerId, playerName: p.playerName, eliminated: !!p.eliminated })),
    myCard:        state.cards[forPlayerId] ?? [],
    amEliminated:  !!(me && me.eliminated),
    survivors:     state.players.filter(p => !p.eliminated).length,
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
