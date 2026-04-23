'use strict';

/**
 * CoupGame — Physical simulator domain module.
 *
 * Simulates the physical components of Coup:
 *   - Shared deck (draw / return cards)
 *   - Shared bank (take / return coins)
 *   - Player influence cards (reveal / exchange)
 *
 * No turn enforcement or action validation — all verbal game mechanics
 * are handled physically by players at the table.
 */

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const ROLES = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
const TOTAL_BANK_COINS = 50;
const STARTING_COINS   = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardsPerRole(playerCount) {
  if (playerCount >= 9) return 5; // 9-10 players → 25 cards
  if (playerCount >= 7) return 4; // 7-8  players → 20 cards
  return 3;                        // 3-6  players → 15 cards
}

function makeDeck(playerCount) {
  const copies = cardsPerRole(playerCount);
  const deck = [];
  for (const role of ROLES) {
    for (let i = 0; i < copies; i++) deck.push(role);
  }
  return shuffle(deck);
}

function checkWinner(state) {
  const active = state.players.filter(p => p.influence.some(c => !c.revealed));
  if (active.length === 1) {
    state.status    = 'finished';
    state.winner    = active[0].playerId;
    state.winnerName = active[0].playerName;
    return { gameOver: true, winner: state.winner, winnerName: state.winnerName, reason: 'Último jogador em pé' };
  }
  return {};
}

// ── Public API ────────────────────────────────────────────────────────────────

function initState(players) {
  const deck = makeDeck(players.length);

  const gamePlayers = players.map(p => ({
    playerId:        p.playerId,
    playerName:      p.playerName,
    coins:           STARTING_COINS,
    influence: [
      { role: deck.pop(), revealed: false },
      { role: deck.pop(), revealed: false },
    ],
    exchangeOptions: null,
  }));

  return {
    players:   gamePlayers,
    deck,
    bankCoins: TOTAL_BANK_COINS - (gamePlayers.length * STARTING_COINS),
    status:    'playing',
    winner:    null,
    winnerName: null,
  };
}

function applyAction(state, action, playerId) {
  if (state.status === 'finished') return { error: 'Jogo encerrado' };

  const playerIdx = state.players.findIndex(p => p.playerId === playerId);
  if (playerIdx === -1) return { error: 'Jogador não encontrado' };

  const player = state.players[playerIdx];

  switch (action.type) {

    // ── Coins ───────────────────────────────────────────────────────────────

    case 'take-coin': {
      if (state.bankCoins <= 0) return { error: 'Sem moedas no banco' };
      state.bankCoins--;
      player.coins++;
      return {};
    }

    case 'return-coin': {
      if (player.coins <= 0) return { error: 'Sem moedas para devolver' };
      player.coins--;
      state.bankCoins++;
      return {};
    }

    // ── Cards ────────────────────────────────────────────────────────────────

    case 'reveal-card': {
      const { cardIndex } = action;
      const card = player.influence[cardIndex];
      if (!card)          return { error: 'Carta inválida' };
      if (card.revealed)  return { error: 'Carta já revelada' };
      card.revealed = true;
      return checkWinner(state);
    }

    case 'return-card-to-deck': {
      const { cardIndex } = action;
      const card = player.influence[cardIndex];
      if (!card)          return { error: 'Carta inválida' };
      if (state.deck.length === 0) return { error: 'Baralho vazio' };

      state.deck.push(card.role);
      state.deck = shuffle(state.deck);
      player.influence[cardIndex] = { role: state.deck.pop(), revealed: false };
      return {};
    }

    // ── Ambassador exchange ──────────────────────────────────────────────────

    case 'ambassador-start': {
      const unrevealed = player.influence.filter(c => !c.revealed);
      if (unrevealed.length === 0)       return { error: 'Você está eliminado' };
      if (player.exchangeOptions !== null) return { error: 'Troca já em andamento' };
      if (state.deck.length === 0)       return { error: 'Baralho vazio' };

      const drawCount = Math.min(2, state.deck.length);
      const drawn = [];
      for (let i = 0; i < drawCount; i++) drawn.push(state.deck.pop());
      player.exchangeOptions = drawn;
      return {};
    }

    case 'ambassador-choose': {
      if (!player.exchangeOptions) return { error: 'Nenhuma troca em andamento' };

      const { keep } = action;
      const ownUnrevealed = player.influence.filter(c => !c.revealed);
      const keepCount     = ownUnrevealed.length;
      const allOptions    = [...ownUnrevealed.map(c => c.role), ...player.exchangeOptions];

      if (!Array.isArray(keep) || keep.length !== keepCount) {
        return { error: `Escolha exatamente ${keepCount} carta(s) para manter` };
      }
      if (new Set(keep).size !== keep.length)              return { error: 'Selecione cartas diferentes' };
      if (keep.some(i => i < 0 || i >= allOptions.length)) return { error: 'Índice inválido' };

      const keptRoles     = keep.map(i => allOptions[i]);
      const returnedRoles = allOptions.filter((_, i) => !keep.includes(i));

      let ki = 0;
      for (const card of player.influence) {
        if (!card.revealed) card.role = keptRoles[ki++];
      }
      for (const role of returnedRoles) state.deck.push(role);
      state.deck = shuffle(state.deck);
      player.exchangeOptions = null;
      return {};
    }

    case 'reset': {
      const players = state.players.map(p => ({ playerId: p.playerId, playerName: p.playerName }));
      const fresh   = initState(players);
      state.players   = fresh.players;
      state.deck      = fresh.deck;
      state.bankCoins = fresh.bankCoins;
      state.status    = fresh.status;
      state.winner    = fresh.winner;
      state.winnerName = fresh.winnerName;
      return { events: ['Jogo reiniciado pelo administrador'] };
    }

    default:
      return { error: 'Ação inválida' };
  }
}

function getPublicState(state, forPlayerId) {
  const me = state.players.find(p => p.playerId === forPlayerId);

  return {
    myPlayerId:      forPlayerId,
    players: state.players.map(p => ({
      playerId:    p.playerId,
      playerName:  p.playerName,
      coins:       p.coins,
      influence:   p.influence.map(c => ({
        role:     (c.revealed || p.playerId === forPlayerId) ? c.role : null,
        revealed: c.revealed,
      })),
      eliminated:  p.influence.every(c => c.revealed),
      isExchanging: p.exchangeOptions !== null,
    })),
    deckCount:       state.deck.length,
    bankCoins:       state.bankCoins,
    exchangeOptions: me?.exchangeOptions ?? null,
    status:          state.status,
    winner:          state.winner,
    winnerName:      state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, MIN_PLAYERS, MAX_PLAYERS };
