'use strict';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 9;
const START_CHIPS = 1000;

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
const HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];

// ── Deck ─────────────────────────────────────────────────────────────────────

function makeDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── Hand Evaluation ───────────────────────────────────────────────────────────

function combinations5(cards) {
  const result = [];
  const n = cards.length;
  for (let a = 0; a < n-4; a++)
  for (let b = a+1; b < n-3; b++)
  for (let c = b+1; c < n-2; c++)
  for (let d = c+1; d < n-1; d++)
  for (let e = d+1; e < n;   e++)
    result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return result;
}

function evalFive(cards) {
  const vals  = cards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = vals.every((v, i) => i === 0 || vals[i-1] - v === 1);
  let straightHigh = vals[0];
  if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  const freq = {};
  vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const groups = Object.entries(freq)
    .map(([v, c]) => ({ v: +v, c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);
  const counts = groups.map(g => g.c);
  const gVals  = groups.map(g => g.v);

  if (isFlush && isStraight) return { rank: 8, tb: [straightHigh] };
  if (counts[0] === 4)                          return { rank: 7, tb: gVals };
  if (counts[0] === 3 && counts[1] === 2)       return { rank: 6, tb: gVals };
  if (isFlush)                                  return { rank: 5, tb: vals };
  if (isStraight)                               return { rank: 4, tb: [straightHigh] };
  if (counts[0] === 3)                          return { rank: 3, tb: gVals };
  if (counts[0] === 2 && counts[1] === 2)       return { rank: 2, tb: gVals };
  if (counts[0] === 2)                          return { rank: 1, tb: gVals };
  return { rank: 0, tb: vals };
}

function bestHandEval(holeCards, community) {
  const all = [...holeCards, ...community];
  const combos = all.length <= 5 ? [all] : combinations5(all);
  let best = null;
  for (const combo of combos) {
    const ev = evalFive(combo);
    if (!best || compareEval(ev, best) > 0) best = ev;
  }
  return best;
}

function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tb.length, b.tb.length); i++) {
    if (a.tb[i] !== b.tb[i]) return a.tb[i] - b.tb[i];
  }
  return 0;
}

// ── Turn/Phase helpers ────────────────────────────────────────────────────────

function nextActive(players, fromIndex) {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIndex + i) % n;
    const p = players[idx];
    if (!p.folded && !p.eliminated && !p.allIn) return idx;
  }
  return -1;
}

function firstBettingPlayer(state) {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.dealerIndex + i) % n;
    const p = state.players[idx];
    if (!p.folded && !p.eliminated && !p.allIn) return idx;
  }
  return -1;
}

function bettingComplete(state) {
  const active = state.players.filter(p => !p.folded && !p.eliminated && !p.allIn);
  if (active.length === 0) return true;
  return active.every(p => p.hasActed && p.bet === state.currentBet);
}

function postBlind(state, playerIndex, amount) {
  const p = state.players[playerIndex];
  const toPost = Math.min(amount, p.chips);
  p.chips    -= toPost;
  p.bet      += toPost;
  p.totalBet += toPost;
  state.pot  += toPost;
  if (p.chips === 0) p.allIn = true;
  if (p.bet > state.currentBet) state.currentBet = p.bet;
}

// ── Phase transitions ─────────────────────────────────────────────────────────

function advanceTurn(state) {
  const notFolded = state.players.filter(p => !p.folded && !p.eliminated);
  if (notFolded.length <= 1) {
    advancePhase(state);
    return;
  }
  const next = nextActive(state.players, state.currentPlayerIndex);
  if (next === -1 || bettingComplete(state)) {
    advancePhase(state);
  } else {
    state.currentPlayerIndex = next;
  }
}

function advancePhase(state) {
  const notFolded = state.players.filter(p => !p.folded && !p.eliminated);
  if (notFolded.length <= 1) {
    if (notFolded.length === 1) {
      notFolded[0].chips += state.pot;
      state.pot = 0;
      state.lastWinners     = [notFolded[0].playerId];
      state.lastWinnerNames = [notFolded[0].playerName];
      state.lastWinningHand = 'Todos desistiram';
    }
    state.phase = 'showdown';
    checkGameOver(state);
    return;
  }

  state.players.forEach(p => { p.bet = 0; p.hasActed = false; });
  state.currentBet = 0;

  switch (state.phase) {
    case 'preflop':
      state.communityCards.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
      state.phase = 'flop';
      break;
    case 'flop':
      state.communityCards.push(state.deck.pop());
      state.phase = 'turn';
      break;
    case 'turn':
      state.communityCards.push(state.deck.pop());
      state.phase = 'river';
      break;
    case 'river':
      doShowdown(state);
      state.phase = 'showdown';
      return;
    default:
      return;
  }

  const firstIdx = firstBettingPlayer(state);
  if (firstIdx === -1) {
    advancePhase(state);
  } else {
    state.currentPlayerIndex = firstIdx;
  }
}

// ── Showdown ──────────────────────────────────────────────────────────────────

function doShowdown(state) {
  const contenders = state.players.filter(p => !p.folded && !p.eliminated);

  const evaluated = contenders.map(p => ({
    player: p,
    ev: bestHandEval(p.hand, state.communityCards),
  }));

  evaluated.sort((a, b) => compareEval(b.ev, a.ev));
  const bestEv  = evaluated[0].ev;
  const winners = evaluated.filter(e => compareEval(e.ev, bestEv) === 0);

  const share     = Math.floor(state.pot / winners.length);
  const remainder = state.pot - share * winners.length;
  winners.forEach(w => { w.player.chips += share; });
  if (remainder > 0) winners[0].player.chips += remainder;
  state.pot = 0;

  state.lastWinners     = winners.map(w => w.player.playerId);
  state.lastWinnerNames = winners.map(w => w.player.playerName);
  state.lastWinningHand = HAND_NAMES[bestEv.rank];

  checkGameOver(state);
}

function checkGameOver(state) {
  state.players.forEach(p => { if (p.chips === 0) p.eliminated = true; });
  const alive = state.players.filter(p => !p.eliminated);
  if (alive.length === 1) {
    state.status     = 'finished';
    state.winner     = alive[0].playerId;
    state.winnerName = alive[0].playerName;
  }
}

// ── Deal a hand ───────────────────────────────────────────────────────────────

function dealHand(state) {
  state.deck         = shuffle(makeDeck());
  state.communityCards = [];

  const nonElim = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.eliminated);
  const count = nonElim.length;

  nonElim.forEach(({ p }) => {
    p.hand     = [state.deck.pop(), state.deck.pop()];
    p.bet      = 0;
    p.totalBet = 0;
    p.folded   = false;
    p.allIn    = false;
    p.hasActed = false;
  });
  state.pot        = 0;
  state.currentBet = 0;

  const dealerPos = nonElim.findIndex(({ i }) => i === state.dealerIndex);
  const dp = dealerPos === -1 ? 0 : dealerPos;

  // Primeiro a agir é o jogador à esquerda do dealer
  const firstPos = (dp + 1) % count;

  state.currentPlayerIndex = nonElim[firstPos].i;
  state.phase = 'preflop';
}

// ── Public API ────────────────────────────────────────────────────────────────

function initState(players) {
  const state = {
    deck: [],
    communityCards: [],
    players: players.map(({ playerId, playerName }) => ({
      playerId,
      playerName,
      chips:      START_CHIPS,
      hand:       [],
      bet:        0,
      totalBet:   0,
      folded:     false,
      allIn:      false,
      eliminated: false,
      hasActed:   false,
    })),
    pot:                0,
    currentBet:         0,
    phase:              'preflop',
    dealerIndex:        0,
    currentPlayerIndex: 0,
    handNumber:         1,
    lastWinners:        null,
    lastWinnerNames:    null,
    lastWinningHand:    null,
    status:             'playing',
    winner:             null,
    winnerName:         null,
  };

  dealHand(state);
  return state;
}

function applyAction(state, action, playerId) {
  if (state.status === 'finished') return { error: 'O jogo acabou.' };

  // ── next-hand ──────────────────────────────────────────────────────────────
  if (action.type === 'next-hand') {
    if (state.phase !== 'showdown') return { error: 'Aguarde o showdown.' };

    const alive = state.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.eliminated);
    const curPos = alive.findIndex(({ i }) => i === state.dealerIndex);
    state.dealerIndex = alive[(curPos + 1) % alive.length].i;
    state.handNumber++;
    state.lastWinners     = null;
    state.lastWinnerNames = null;
    state.lastWinningHand = null;

    dealHand(state);
    return { events: [`Mão #${state.handNumber} iniciada.`] };
  }

  // ── Normal actions need player's turn ─────────────────────────────────────
  const player = state.players.find(p => p.playerId === playerId);
  if (!player)            return { error: 'Jogador não encontrado.' };
  if (state.phase === 'showdown') return { error: 'Aguarde a próxima mão.' };
  if (state.players[state.currentPlayerIndex]?.playerId !== playerId)
    return { error: 'Não é a sua vez.' };
  if (player.folded)     return { error: 'Você já desistiu.' };
  if (player.eliminated) return { error: 'Você foi eliminado.' };
  if (player.allIn)      return { error: 'Você está all-in.' };

  switch (action.type) {
    case 'fold': {
      player.folded   = true;
      player.hasActed = true;
      advanceTurn(state);
      break;
    }

    case 'check': {
      if (player.bet !== state.currentBet)
        return { error: 'Você precisa pagar ou aumentar.' };
      player.hasActed = true;
      advanceTurn(state);
      break;
    }

    case 'call': {
      if (player.bet >= state.currentBet)
        return { error: 'Nada a pagar. Use "check".' };
      const toCall    = Math.min(state.currentBet - player.bet, player.chips);
      player.chips   -= toCall;
      player.bet     += toCall;
      player.totalBet += toCall;
      state.pot      += toCall;
      if (player.chips === 0) player.allIn = true;
      player.hasActed = true;
      advanceTurn(state);
      break;
    }

    case 'raise': {
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: 'Valor inválido.' };
      const diff = (state.currentBet - player.bet) + amount;
      if (diff > player.chips) return { error: 'Fichas insuficientes.' };
      player.chips   -= diff;
      player.bet     += diff;
      player.totalBet += diff;
      state.pot      += diff;
      state.currentBet = player.bet;
      if (player.chips === 0) player.allIn = true;
      state.players.forEach(p => {
        if (p.playerId !== playerId && !p.folded && !p.eliminated && !p.allIn)
          p.hasActed = false;
      });
      player.hasActed = true;
      advanceTurn(state);
      break;
    }

    default:
      return { error: 'Ação inválida.' };
  }

  if (state.status === 'finished') {
    return {
      gameOver:   true,
      winner:     state.winner,
      winnerName: state.winnerName,
      reason:     `${state.winnerName} venceu o torneio!`,
    };
  }
  return {};
}

// Saída individual: trata como fold (se estava numa rodada de apostas),
// remove o jogador do array e corrige os índices de dealer/vez. As fichas
// dele saem do jogo; apostas já feitas permanecem no pote.
function removePlayer(state, playerId) {
  const idx = state.players.findIndex(p => p.playerId === playerId);
  if (idx === -1) return {};
  const player = state.players[idx];

  if (state.status === 'playing' && state.phase !== 'showdown' && !player.folded && !player.eliminated) {
    player.folded   = true;
    player.hasActed = true;
    if (state.currentPlayerIndex === idx) {
      advanceTurn(state);
    } else if (bettingComplete(state)) {
      advancePhase(state);
    }
  }

  state.players.splice(idx, 1);
  const n = state.players.length;
  if (n === 0) return {};

  if (state.dealerIndex > idx) state.dealerIndex--;
  state.dealerIndex %= n;
  if (state.currentPlayerIndex > idx) state.currentPlayerIndex--;
  state.currentPlayerIndex %= n;

  if (state.status !== 'finished') checkGameOver(state);
  if (state.status === 'finished' && state.winner) {
    return {
      gameOver:   true,
      winner:     state.winner,
      winnerName: state.winnerName,
      reason:     `${state.winnerName} venceu o torneio!`,
    };
  }
  return {};
}

function getPublicState(state, forPlayerId, hostPlayerId) {
  return {
    myPlayerId:          forPlayerId,
    hostPlayerId,
    players: state.players.map(p => ({
      playerId:   p.playerId,
      playerName: p.playerName,
      chips:      p.chips,
      bet:        p.bet,
      totalBet:   p.totalBet,
      folded:     p.folded,
      allIn:      p.allIn,
      eliminated: p.eliminated,
      hand: (p.playerId === forPlayerId || (state.phase === 'showdown' && !p.folded))
        ? p.hand
        : p.hand.map(() => null),
    })),
    communityCards:      state.communityCards,
    pot:                 state.pot,
    currentBet:         state.currentBet,
    phase:               state.phase,
    dealerIndex:         state.dealerIndex,
    currentPlayerIndex:  state.currentPlayerIndex,
    handNumber:          state.handNumber,
    lastWinners:         state.lastWinners,
    lastWinnerNames:     state.lastWinnerNames,
    lastWinningHand:     state.lastWinningHand,
    status:              state.status,
    winner:              state.winner,
    winnerName:          state.winnerName,
  };
}

module.exports = { MIN_PLAYERS, MAX_PLAYERS, initState, applyAction, getPublicState, removePlayer };
