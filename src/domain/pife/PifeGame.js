'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

const SUITS  = [{ s: '♥', c: 'red' }, { s: '♦', c: 'red' }, { s: '♠', c: 'black' }, { s: '♣', c: 'black' }];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

let _uid = 0;

function freshDeck() {
  const d = [];
  for (let k = 0; k < 2; k++)
    for (const su of SUITS)
      for (const r of RANKS)
        d.push({ id: ++_uid, rank: r, suit: su.s, color: su.c });
  return d;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── State management ──────────────────────────────────────────────────────────
function reshuffleIfNeeded(state) {
  if (state.stock.length > 0) return;
  if (state.discard.length <= 1) return;
  const top = state.discard.pop();
  state.stock   = shuffle(state.discard.splice(0));
  state.discard = [top];
}

function initState(players) {
  const deck = shuffle(freshDeck());
  const hands = {};
  for (const p of players) {
    hands[p.playerId] = deck.splice(0, 9);
  }
  return {
    players: players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      avatar:     p.avatar || null,
      color:      p.color  || null,
    })),
    hands,
    stock:    deck,
    discard:  [deck.pop()],
    status:   'playing',
    winner:         null,
    winnerName:     null,
    round:          1,
  };
}

function applyAction(state, action, playerId) {
  if (action.type === 'draw-stock') {
    const hand = state.hands[playerId];
    if (hand.length >= 10) return { error: 'Mão cheia — descarte antes de comprar' };
    reshuffleIfNeeded(state);
    if (!state.stock.length) return { error: 'Baralho vazio' };
    hand.push(state.stock.pop());
    return { animCard: hand[hand.length - 1] };
  }

  if (action.type === 'draw-discard') {
    const hand = state.hands[playerId];
    if (hand.length >= 10) return { error: 'Mão cheia — descarte antes de comprar' };
    if (!state.discard.length) return { error: 'Descarte vazio' };
    const drawn = state.discard.pop();
    hand.push(drawn);
    return { animCard: drawn };
  }

  if (action.type === 'discard') {
    const hand = state.hands[playerId];
    if (!hand) return { error: 'Carta não encontrada' };
    if (hand.length < 10) return { error: 'Compre uma carta antes de descartar' };
    const idx = hand.findIndex(c => c.id === action.cardId);
    if (idx === -1) return { error: 'Carta não encontrada' };
    const [card] = hand.splice(idx, 1);
    state.discard.push(card);
    state.round += 1;
    return { animCard: card };
  }

  return { error: 'Ação desconhecida' };
}

// Saída individual: devolve a mão ao baralho (embaralhada) e remove o jogador.
function removePlayer(state, playerId) {
  state.stock = shuffle([...state.stock, ...(state.hands[playerId] || [])]);
  delete state.hands[playerId];
  state.players = state.players.filter(p => p.playerId !== playerId);
}

function getPublicState(state, forPlayerId, hostPlayerId) {
  return {
    myPlayerId:            forPlayerId,
    hostPlayerId:          hostPlayerId ?? null,
    myHand:                state.hands[forPlayerId] || [],
    players:               state.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      avatar:     p.avatar,
      color:      p.color,
      handCount:  (state.hands[p.playerId] || []).length,
    })),
    stockCount:  state.stock.length,
    discardTop:  state.discard.length ? state.discard[state.discard.length - 1] : null,
    status:      state.status,
    winner:                state.winner,
    winnerName:            state.winnerName,
    round:                 state.round,
  };
}

module.exports = { initState, applyAction, getPublicState, removePlayer, MIN_PLAYERS, MAX_PLAYERS };
