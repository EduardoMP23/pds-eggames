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

function generateCard() {
  return shuffle(Array.from({ length: 100 }, (_, i) => i + 1)).slice(0, 24);
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
