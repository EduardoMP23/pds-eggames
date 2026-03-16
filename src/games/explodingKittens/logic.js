const minPlayers = 2;
const maxPlayers = 5;

const CARD_TYPES = {
  EXPLODING_KITTEN: 'exploding_kitten',
  DEFUSE: 'defuse',
  ATTACK: 'attack',
  SKIP: 'skip',
  FAVOR: 'favor',
  SHUFFLE: 'shuffle',
  SEE_THE_FUTURE: 'see_the_future',
  NOPE: 'nope',
  TACOCAT: 'tacocat',
  CATERMELON: 'catermelon',
  HAIRY_POTATO_CAT: 'hairy_potato_cat',
  RAINBOW_RALPHING_CAT: 'rainbow_ralphing_cat',
  BEARD_CAT: 'beard_cat'
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(playerCount) {
  const deck = [];
  // Defuse cards (1 per player stays in hand, extras in deck)
  for (let i = 0; i < Math.max(0, 6 - playerCount); i++) deck.push(CARD_TYPES.DEFUSE);
  // Action cards
  for (let i = 0; i < 4; i++) {
    deck.push(CARD_TYPES.ATTACK);
    deck.push(CARD_TYPES.SKIP);
    deck.push(CARD_TYPES.FAVOR);
    deck.push(CARD_TYPES.SHUFFLE);
    deck.push(CARD_TYPES.NOPE);
  }
  for (let i = 0; i < 2; i++) deck.push(CARD_TYPES.SEE_THE_FUTURE);
  // Cat cards (5 types x 4)
  [CARD_TYPES.TACOCAT, CARD_TYPES.CATERMELON, CARD_TYPES.HAIRY_POTATO_CAT, CARD_TYPES.RAINBOW_RALPHING_CAT, CARD_TYPES.BEARD_CAT].forEach(cat => {
    for (let i = 0; i < 4; i++) deck.push(cat);
  });
  return shuffle(deck);
}

function initState(players) {
  const deck = buildDeck(players.length);
  const playerStates = players.map(p => {
    const hand = [CARD_TYPES.DEFUSE];
    for (let i = 0; i < 7; i++) hand.push(deck.pop());
    return { playerId: p.playerId, playerName: p.playerName, hand, drawsRequired: 1, isAlive: true };
  });

  // Insert exploding kittens (playerCount - 1)
  for (let i = 0; i < players.length - 1; i++) deck.push(CARD_TYPES.EXPLODING_KITTEN);
  const finalDeck = shuffle(deck);

  return {
    players: playerStates,
    drawPile: finalDeck,
    discardPile: [],
    currentTurnIndex: 0,
    phase: 'play', // 'play' | 'nope-window' | 'draw'
    pendingAction: null,
    nopeCount: 0,
    seeFutureCards: null,
    seeFuturePlayerId: null,
    status: 'playing',
    winner: null
  };
}

function currentPlayer(state) {
  return state.players[state.currentTurnIndex];
}

function nextAliveIndex(state, fromIndex) {
  let idx = (fromIndex + 1) % state.players.length;
  while (!state.players[idx].isAlive) {
    idx = (idx + 1) % state.players.length;
  }
  return idx;
}

function applyAction(state, action, playerId) {
  const events = [];
  const player = state.players.find(p => p.playerId === playerId);
  if (!player) return { error: 'Player not found' };

  // Nope can be played by anyone during nope-window
  if (action.type === 'nope') {
    if (state.phase !== 'nope-window') return { error: 'Cannot Nope now' };
    const nopeIdx = player.hand.indexOf(CARD_TYPES.NOPE);
    if (nopeIdx === -1) return { error: 'No Nope card in hand' };
    player.hand.splice(nopeIdx, 1);
    state.discardPile.push(CARD_TYPES.NOPE);
    state.nopeCount++;
    events.push(`${player.playerName} played Nope!`);
    return { events, nopeTimer: true };
  }

  if (currentPlayer(state).playerId !== playerId) return { error: 'Not your turn' };

  if (action.type === 'play') {
    return handlePlayCard(state, action, player, events);
  }

  if (action.type === 'draw') {
    if (state.phase !== 'play') return { error: 'Cannot draw now' };
    return handleDraw(state, player, events);
  }

  if (action.type === 'favor-give') {
    return handleFavorGive(state, action, player, events);
  }

  if (action.type === 'defuse') {
    return handleDefuse(state, action, player, events);
  }

  return { error: 'Unknown action type' };
}

function handlePlayCard(state, action, player, events) {
  const { card, targetPlayerId, card2 } = action;

  // Cat combo (2 matching)
  const catCards = [CARD_TYPES.TACOCAT, CARD_TYPES.CATERMELON, CARD_TYPES.HAIRY_POTATO_CAT, CARD_TYPES.RAINBOW_RALPHING_CAT, CARD_TYPES.BEARD_CAT];
  if (catCards.includes(card)) {
    const count = player.hand.filter(c => c === card).length;
    if (count < 2) return { error: 'Need 2 matching cat cards' };
    if (!targetPlayerId) return { error: 'Need to target a player' };
    const target = state.players.find(p => p.playerId === targetPlayerId && p.isAlive);
    if (!target || target.playerId === player.playerId) return { error: 'Invalid target' };
    if (target.hand.length === 0) return { error: 'Target has no cards' };

    // Remove 2 cat cards
    let removed = 0;
    player.hand = player.hand.filter(c => { if (c === card && removed < 2) { removed++; return false; } return true; });
    state.discardPile.push(card, card);

    // Steal random card
    const stolen = target.hand.splice(Math.floor(Math.random() * target.hand.length), 1)[0];
    player.hand.push(stolen);
    events.push(`${player.playerName} stole a card from ${target.playerName}`);

    state.pendingAction = { type: 'cat-combo', done: true };
    state.phase = 'nope-window';
    state.nopeCount = 0;
    return { events, nopeTimer: true };
  }

  const cardIdx = player.hand.indexOf(card);
  if (cardIdx === -1) return { error: 'Card not in hand' };

  player.hand.splice(cardIdx, 1);
  state.discardPile.push(card);

  if (card === CARD_TYPES.ATTACK) {
    state.pendingAction = { type: 'attack' };
    state.phase = 'nope-window';
    state.nopeCount = 0;
    events.push(`${player.playerName} played Attack!`);
    return { events, nopeTimer: true };
  }

  if (card === CARD_TYPES.SKIP) {
    state.pendingAction = { type: 'skip' };
    state.phase = 'nope-window';
    state.nopeCount = 0;
    events.push(`${player.playerName} played Skip`);
    return { events, nopeTimer: true };
  }

  if (card === CARD_TYPES.SHUFFLE) {
    state.pendingAction = { type: 'shuffle' };
    state.phase = 'nope-window';
    state.nopeCount = 0;
    events.push(`${player.playerName} played Shuffle`);
    return { events, nopeTimer: true };
  }

  if (card === CARD_TYPES.SEE_THE_FUTURE) {
    const top3 = state.drawPile.slice(-3).reverse();
    state.seeFutureCards = top3;
    state.seeFuturePlayerId = player.playerId;
    state.pendingAction = { type: 'see_the_future' };
    state.phase = 'nope-window';
    state.nopeCount = 0;
    events.push(`${player.playerName} played See the Future`);
    return { events, nopeTimer: true };
  }

  if (card === CARD_TYPES.FAVOR) {
    if (!targetPlayerId) return { error: 'Need to target a player' };
    const target = state.players.find(p => p.playerId === targetPlayerId && p.isAlive);
    if (!target || target.playerId === player.playerId) return { error: 'Invalid target' };
    if (target.hand.length === 0) return { error: 'Target has no cards' };
    state.pendingAction = { type: 'favor', fromPlayerId: targetPlayerId, toPlayerId: player.playerId };
    state.phase = 'nope-window';
    state.nopeCount = 0;
    events.push(`${player.playerName} played Favor on ${target.playerName}`);
    return { events, nopeTimer: true };
  }

  return { error: 'Cannot play this card directly' };
}

function handleDraw(state, player, events) {
  const card = state.drawPile.pop();

  if (card === CARD_TYPES.EXPLODING_KITTEN) {
    const defuseIdx = player.hand.indexOf(CARD_TYPES.DEFUSE);
    if (defuseIdx !== -1) {
      player.hand.splice(defuseIdx, 1);
      state.discardPile.push(CARD_TYPES.DEFUSE);
      state.phase = 'defuse';
      state.pendingAction = { type: 'exploding-kitten', playerId: player.playerId };
      events.push(`${player.playerName} drew an Exploding Kitten and used a Defuse!`);
      return { events };
    } else {
      player.isAlive = false;
      events.push(`${player.playerName} exploded!`);
      const alive = state.players.filter(p => p.isAlive);
      if (alive.length === 1) {
        state.status = 'finished';
        state.winner = alive[0].playerId;
        return { events, gameOver: true, winner: alive[0].playerId, winnerName: alive[0].playerName };
      }
      state.currentTurnIndex = nextAliveIndex(state, state.currentTurnIndex);
      player.drawsRequired = 1;
      state.phase = 'play';
      state.pendingAction = null;
      return { events };
    }
  }

  player.hand.push(card);
  events.push(`${player.playerName} drew a card`);

  player.drawsRequired--;
  if (player.drawsRequired <= 0) {
    player.drawsRequired = 1;
    state.currentTurnIndex = nextAliveIndex(state, state.currentTurnIndex);
    state.players[state.currentTurnIndex].drawsRequired = 1;
    state.phase = 'play';
    state.pendingAction = null;
  }

  return { events };
}

function handleFavorGive(state, action, player, events) {
  if (!state.pendingAction || state.pendingAction.type !== 'favor') return { error: 'No pending favor' };
  if (state.pendingAction.fromPlayerId !== player.playerId) return { error: 'Not your favor to give' };

  const cardIdx = player.hand.indexOf(action.card);
  if (cardIdx === -1) return { error: 'Card not in hand' };

  player.hand.splice(cardIdx, 1);
  const recipient = state.players.find(p => p.playerId === state.pendingAction.toPlayerId);
  recipient.hand.push(action.card);

  events.push(`${player.playerName} gave a card to ${recipient.playerName}`);
  state.pendingAction = null;
  state.phase = 'play';
  return { events };
}

function handleDefuse(state, action, player, events) {
  if (state.phase !== 'defuse') return { error: 'Cannot defuse now' };

  const position = typeof action.position === 'number'
    ? Math.min(Math.max(action.position, 0), state.drawPile.length)
    : Math.floor(Math.random() * (state.drawPile.length + 1));

  state.drawPile.splice(state.drawPile.length - position, 0, CARD_TYPES.EXPLODING_KITTEN);
  events.push(`${player.playerName} inserted the Exploding Kitten back into the deck`);

  state.currentTurnIndex = nextAliveIndex(state, state.currentTurnIndex);
  state.players[state.currentTurnIndex].drawsRequired = 1;
  state.phase = 'play';
  state.pendingAction = null;
  return { events };
}

function resolveNopeTimer(state) {
  if (state.phase !== 'nope-window') return null;
  const pending = state.pendingAction;
  if (!pending) return null;

  const events = [];
  const isNoped = state.nopeCount % 2 === 1;

  if (isNoped) {
    events.push(`Action was Noped!`);
    // Undo stolen card for cat combo
    state.phase = 'play';
    state.pendingAction = null;
    state.nopeCount = 0;
    state.seeFutureCards = null;
    state.seeFuturePlayerId = null;
    return { events };
  }

  // Resolve action
  const currentP = currentPlayer(state);
  if (pending.type === 'attack') {
    const nextIdx = nextAliveIndex(state, state.currentTurnIndex);
    state.players[nextIdx].drawsRequired = 2;
    state.currentTurnIndex = nextIdx;
    state.phase = 'play';
    events.push(`${state.players[nextIdx].playerName} must draw twice!`);
  } else if (pending.type === 'skip') {
    currentP.drawsRequired--;
    if (currentP.drawsRequired <= 0) {
      currentP.drawsRequired = 1;
      state.currentTurnIndex = nextAliveIndex(state, state.currentTurnIndex);
      state.players[state.currentTurnIndex].drawsRequired = 1;
    }
    state.phase = 'play';
  } else if (pending.type === 'shuffle') {
    state.drawPile = shuffle(state.drawPile);
    state.phase = 'play';
    events.push('Deck shuffled!');
  } else if (pending.type === 'see_the_future') {
    state.phase = 'play';
  } else if (pending.type === 'favor') {
    // Waiting for favor-give from target player — keep pendingAction but change phase
    state.phase = 'play';
  } else if (pending.type === 'cat-combo') {
    state.phase = 'play';
  }

  state.nopeCount = 0;
  return { events };
}

function getPublicState(state, forPlayerId) {
  const me = state.players.find(p => p.playerId === forPlayerId);
  return {
    players: state.players.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      handCount: p.hand.length,
      isAlive: p.isAlive,
      drawsRequired: p.drawsRequired,
      hand: p.playerId === forPlayerId ? p.hand : undefined
    })),
    drawPileCount: state.drawPile.length,
    discardPile: state.discardPile,
    currentTurnIndex: state.currentTurnIndex,
    currentTurnPlayerId: state.players[state.currentTurnIndex]?.playerId,
    phase: state.phase,
    pendingAction: state.pendingAction ? { type: state.pendingAction.type, toPlayerId: state.pendingAction.toPlayerId, fromPlayerId: state.pendingAction.fromPlayerId } : null,
    isMyTurn: state.players[state.currentTurnIndex]?.playerId === forPlayerId,
    status: state.status,
    winner: state.winner,
    seeFutureCards: state.seeFuturePlayerId === forPlayerId ? state.seeFutureCards : null,
    myHand: me ? me.hand : []
  };
}

module.exports = { minPlayers, maxPlayers, initState, applyAction, getPublicState, resolveNopeTimer };
