'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

const SUITS  = [{ s: '♥', c: 'red' }, { s: '♦', c: 'red' }, { s: '♠', c: 'black' }, { s: '♣', c: 'black' }];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_V = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };

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

// ── Win validation ────────────────────────────────────────────────────────────
function isSet(cards) {
  if (!cards.every(c => c.rank === cards[0].rank)) return false;
  const counts = {};
  for (const c of cards) {
    counts[c.suit] = (counts[c.suit] || 0) + 1;
    if (counts[c.suit] > 2) return false; // 2 decks: max 2 of same rank+suit
  }
  return true;
}

function isSeq(cards) {
  if (!cards.every(c => c.suit === cards[0].suit)) return false;
  const vals = cards.map(c => RANK_V[c.rank]).sort((a, b) => a - b);
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] === vals[i - 1]) return false; // no duplicate rank in sequence
    if (vals[i] !== vals[i - 1] + 1) return false;
  }
  return true;
}

// Backtracking: always fix the first card, try all melds of 3 (or 4) containing it
function canWin(hand) {
  if (hand.length === 0) return true;
  if (hand.length < 3) return false;
  const first = hand[0];
  const rest  = hand.slice(1);
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const m3 = [first, rest[i], rest[j]];
      if (isSet(m3) || isSeq(m3)) {
        const used = new Set([first.id, rest[i].id, rest[j].id]);
        if (canWin(hand.filter(c => !used.has(c.id)))) return true;
      }
      for (let k = j + 1; k < rest.length; k++) {
        const m4 = [first, rest[i], rest[j], rest[k]];
        if (isSet(m4) || isSeq(m4)) {
          const used = new Set([first.id, rest[i].id, rest[j].id, rest[k].id]);
          if (canWin(hand.filter(c => !used.has(c.id)))) return true;
        }
      }
    }
  }
  return false;
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
    const idx = hand.findIndex(c => c.id === action.cardId);
    if (idx === -1) return { error: 'Carta não encontrada' };
    const [card] = hand.splice(idx, 1);
    state.discard.push(card);

    if (canWin(hand)) {
      const winner = state.players.find(p => p.playerId === playerId);
      state.status     = 'finished';
      state.winner     = playerId;
      state.winnerName = winner?.playerName ?? playerId;
      return {
        gameOver:   true,
        winner:     playerId,
        winnerName: state.winnerName,
        reason:     `${state.winnerName} bateu — mão completa!`,
        animCard:   card,
      };
    }

    state.round += 1;
    return { animCard: card };
  }

  return { error: 'Ação desconhecida' };
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

module.exports = { initState, applyAction, getPublicState, MIN_PLAYERS, MAX_PLAYERS };
