'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw-two'];

function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: '0' });
    for (let i = 1; i <= 12; i++) {
      const value = VALUES[i];
      deck.push({ color, value });
      deck.push({ color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild-draw-four' });
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

function nextIndex(state, from) {
  const n = state.players.length;
  return ((from + state.direction) % n + n) % n;
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
    players:            gamePlayers,
    deck,
    discardPile:        [firstCard],
    currentPlayerIndex: 0,
    direction:          1,
    currentColor:       firstCard.color,
    status:             'playing',
    winner:             null,
    winnerName:         null,
  };
}

function applyAction(state, action, playerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) return { error: 'Player not found' };
  const player = state.players[playerIndex];

  switch (action.type) {
    case 'play-card': {
      const { cardIndex } = action;
      if (cardIndex < 0 || cardIndex >= player.hand.length) return { error: 'Invalid card index' };

      const card = player.hand.splice(cardIndex, 1)[0];
      state.discardPile.push(card);

      state.currentPlayerIndex = nextIndex(state, playerIndex);

      if (player.hand.length === 0) {
        state.status = 'finished';
        state.winner = playerId;
        state.winnerName = player.playerName;
        return { gameOver: true, winner: playerId, winnerName: player.playerName };
      }

      return {};
    }

    case 'draw-card': {
      drawCard(state, playerIndex);
      return {};
    }

    default:
      return { error: 'Unknown action' };
  }
}

function getPublicState(state, forPlayerId, hostPlayerId) {
  const topCard = state.discardPile[state.discardPile.length - 1] || null;

  return {
    myPlayerId:         forPlayerId,
    hostPlayerId:       hostPlayerId ?? null,
    players: state.players.map(p => {
      if (p.playerId === forPlayerId) {
        return { playerId: p.playerId, playerName: p.playerName, hand: p.hand, cardCount: p.hand.length };
      }
      return { playerId: p.playerId, playerName: p.playerName, hand: null, cardCount: p.hand.length };
    }),
    topCard,
    currentColor:       state.currentColor,
    currentPlayerIndex: state.currentPlayerIndex,
    direction:          state.direction,
    deckCount:          state.deck.length,
    status:             state.status,
    winner:             state.winner,
    winnerName:         state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, MIN_PLAYERS, MAX_PLAYERS };
