'use strict';

const CARDS = require('./cards');

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 21;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initState(players) {
  const shuffledCards = shuffle(CARDS);
  return {
    players:            players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      avatar:     p.avatar || null,
      color:      p.color  || null,
      score:      0,
    })),
    cards:              shuffledCards,
    usedCardCount:      0,
    currentCard:        shuffledCards[0],
    currentReaderIndex: 0,
    phase:              'reading',
    acceptedBy:         null,
    acceptedByName:     null,
    targetScore:        7,
    round:              1,
    status:             'playing',
    winner:             null,
    winnerName:         null,
  };
}

function applyAction(state, action, playerId) {
  // ── Internal server timer: reading → accepting ────────────────────
  if (action.type === '_advance-accepting') {
    if (state.phase !== 'reading') return {};
    state.phase = 'accepting';
    return {};
  }

  // ── Player accepts the card (drag-down) ───────────────────────────
  if (action.type === 'accept-card') {
    if (state.phase !== 'accepting') return { error: 'Aguarde a fase de aceitação' };
    if (!playerId) return { error: 'Jogador não identificado' };
    if (state.acceptedBy) return { error: 'Já foi aceita nesta rodada' };

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { error: 'Jogador não encontrado' };

    player.score += 1;

    if (player.score >= state.targetScore) {
      state.status     = 'finished';
      state.winner     = playerId;
      state.winnerName = player.playerName;
      return {
        gameOver:   true,
        winner:     playerId,
        winnerName: player.playerName,
        reason:     `${player.playerName} é o Pior Amigo da mesa!`,
      };
    }

    // auto-advance to next round
    state.usedCardCount      += 1;
    state.currentCard         = state.cards[state.usedCardCount % state.cards.length];
    state.currentReaderIndex  = (state.currentReaderIndex + 1) % state.players.length;
    state.phase               = 'reading';
    state.acceptedBy          = null;
    state.acceptedByName      = null;
    state.round              += 1;
    return { advancedToReading: true };
  }

  // ── Next round (host) ─────────────────────────────────────────────
  if (action.type === 'next-round') {
    if (state.phase !== 'accepting') return { error: 'Aguarde a fase de aceitação' };
    state.usedCardCount      += 1;
    state.currentCard         = state.cards[state.usedCardCount % state.cards.length];
    state.currentReaderIndex  = (state.currentReaderIndex + 1) % state.players.length;
    state.phase               = 'reading';
    state.acceptedBy          = null;
    state.acceptedByName      = null;
    state.round              += 1;
    return { advancedToReading: true };
  }

  // ── Set target score (host) ───────────────────────────────────────
  if (action.type === 'set-target') {
    const score = Number(action.score);
    if (!Number.isInteger(score) || score < 3 || score > 15) {
      return { error: 'Pontuação-alvo deve ser entre 3 e 15' };
    }
    state.targetScore = score;
    return {};
  }

  return { error: 'Ação desconhecida' };
}

// Saída individual: remove o jogador ajustando o índice do leitor; o jogo
// segue normal para os demais.
function removePlayer(state, playerId) {
  const idx = state.players.findIndex(p => p.playerId === playerId);
  if (idx === -1) return;
  state.players.splice(idx, 1);
  if (idx < state.currentReaderIndex) state.currentReaderIndex--;
  if (state.players.length > 0) {
    state.currentReaderIndex %= state.players.length;
  } else {
    state.currentReaderIndex = 0;
  }
}

function getPublicState(state, forPlayerId, hostPlayerId) {
  const isReader = state.players[state.currentReaderIndex]?.playerId === forPlayerId;

  return {
    myPlayerId:         forPlayerId,
    hostPlayerId:       hostPlayerId ?? null,
    players:            state.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      avatar:     p.avatar,
      color:      p.color,
      score:      p.score,
    })),
    currentCard:        isReader ? state.currentCard : null,
    currentReaderIndex: state.currentReaderIndex,
    currentReaderId:    state.players[state.currentReaderIndex]?.playerId ?? null,
    phase:              state.phase,
    acceptedBy:         state.acceptedBy,
    acceptedByName:     state.acceptedByName,
    targetScore:        state.targetScore,
    round:              state.round,
    status:             state.status,
    winner:             state.winner,
    winnerName:         state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, removePlayer, MIN_PLAYERS, MAX_PLAYERS };
