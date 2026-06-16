'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw-two'];

function makeDeck() {
  const deck = [];
  let uid = 0;
  const add = (color, value) => deck.push({ id: 'c' + (++uid), color, value });

  for (const color of COLORS) {
    add(color, '0');
    for (let i = 1; i <= 12; i++) {
      const value = VALUES[i];
      add(color, value);
      add(color, value);
    }
  }
  for (let i = 0; i < 4; i++) {
    add('wild', 'wild');
    add('wild', 'wild-draw-four');
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function reshuffleDeck(state) {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile.pop();
  const recycled = state.discardPile.splice(0);
  shuffle(recycled);
  state.deck.push(...recycled);
  state.discardPile.push(top);
}

function drawCard(state, playerIndex) {
  if (state.deck.length === 0) reshuffleDeck(state);
  if (state.deck.length === 0) return;
  state.players[playerIndex].hand.push(state.deck.pop());
}

function initState(players) {
  const deck = makeDeck();
  shuffle(deck);

  const gamePlayers = players.map(p => ({
    playerId:   p.playerId,
    playerName: p.playerName,
    hand:       deck.splice(0, 7),
  }));

  let firstCard;
  do {
    firstCard = deck.splice(0, 1)[0];
  } while (firstCard.color === 'wild');

  return {
    players:     gamePlayers,
    deck,
    discardPile: [firstCard],
    status:      'playing',
    winner:      null,
    winnerName:  null,
  };
}

// Mesa livre: sem turnos e sem validação de cor/valor. Qualquer jogador pode
// jogar ou comprar a qualquer momento — a fiscalização é social (contagem de
// cartas + animações visíveis a todos).
function applyAction(state, action, playerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) return { error: 'Player not found' };
  const player = state.players[playerIndex];

  switch (action.type) {
    case 'play-card': {
      const cardIndex = player.hand.findIndex(c => c.id === action.cardId);
      if (cardIndex === -1) return { error: 'Carta não encontrada na sua mão' };

      const card = player.hand.splice(cardIndex, 1)[0];
      state.discardPile.push(card);

      if (player.hand.length === 0) {
        state.status = 'finished';
        state.winner = playerId;
        state.winnerName = player.playerName;
        return { gameOver: true, winner: playerId, winnerName: player.playerName, animCard: card };
      }

      return { animCard: card };
    }

    case 'draw-card': {
      drawCard(state, playerIndex);
      return {};
    }

    case 'draw-discard': {
      // Mesa livre: devolve a carta do topo do descarte para a mão (ex.: desfazer
      // jogada errada). Mantém ao menos 1 carta no descarte para sempre haver topo.
      if (state.discardPile.length <= 1) return { error: 'Descarte não pode ficar vazio' };
      const card = state.discardPile.pop();
      player.hand.push(card);
      return { animCard: card };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// Saída individual: devolve a mão ao baralho e remove o jogador da mesa.
// A partida continua para os demais (mesa livre, sem mínimo para prosseguir).
function removePlayer(state, playerId) {
  const idx = state.players.findIndex(p => p.playerId === playerId);
  if (idx === -1) return;
  const [player] = state.players.splice(idx, 1);
  state.deck.push(...player.hand);
  shuffle(state.deck);
}

function getPublicState(state, forPlayerId, hostPlayerId) {
  const topCard = state.discardPile[state.discardPile.length - 1] || null;

  return {
    myPlayerId:   forPlayerId,
    hostPlayerId: hostPlayerId ?? null,
    players: state.players.map(p => {
      if (p.playerId === forPlayerId) {
        return { playerId: p.playerId, playerName: p.playerName, hand: p.hand, cardCount: p.hand.length };
      }
      return { playerId: p.playerId, playerName: p.playerName, hand: null, cardCount: p.hand.length };
    }),
    topCard,
    deckCount:    state.deck.length,
    discardCount: state.discardPile.length,
    status:     state.status,
    winner:     state.winner,
    winnerName: state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, removePlayer, MIN_PLAYERS, MAX_PLAYERS };
