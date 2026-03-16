const minPlayers = 2;
const maxPlayers = 6;

const ROLES = ['duke', 'assassin', 'ambassador', 'captain', 'contessa'];
const ROLE_COUNTS = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  const deck = [];
  ROLES.forEach(role => {
    for (let i = 0; i < ROLE_COUNTS; i++) deck.push(role);
  });
  return shuffle(deck);
}

function initState(players) {
  const deck = buildDeck();
  const playerStates = players.map(p => ({
    playerId: p.playerId,
    playerName: p.playerName,
    coins: 2,
    influence: [deck.pop(), deck.pop()],
    lostInfluence: [],
    isEliminated: false
  }));

  return {
    players: playerStates,
    deck,
    currentTurnIndex: 0,
    phase: 'action', // action | counter-action | challenge | reveal-influence | exchange-select | resolution
    pendingAction: null,
    pendingCounter: null,
    pendingChallenge: null,
    status: 'playing',
    winner: null,
    log: []
  };
}

function currentPlayer(state) {
  return state.players[state.currentTurnIndex];
}

function nextAliveIndex(state, fromIndex) {
  let idx = (fromIndex + 1) % state.players.length;
  while (state.players[idx].isEliminated) {
    idx = (idx + 1) % state.players.length;
  }
  return idx;
}

function advanceTurn(state) {
  state.currentTurnIndex = nextAliveIndex(state, state.currentTurnIndex);
  state.phase = 'action';
  state.pendingAction = null;
  state.pendingCounter = null;
  state.pendingChallenge = null;
}

function eliminatePlayer(state, player) {
  player.lostInfluence = [...player.influence];
  player.influence = [];
  player.isEliminated = true;
}

function loseInfluence(state, player, card) {
  const idx = player.influence.indexOf(card);
  if (idx === -1) {
    // If card not specified or wrong, lose first influence
    const removed = player.influence.splice(0, 1)[0];
    player.lostInfluence.push(removed);
  } else {
    player.influence.splice(idx, 1);
    player.lostInfluence.push(card);
  }
  if (player.influence.length === 0) {
    player.isEliminated = true;
  }
}

function checkWin(state) {
  const alive = state.players.filter(p => !p.isEliminated);
  if (alive.length === 1) {
    state.status = 'finished';
    state.winner = alive[0].playerId;
    return { gameOver: true, winner: alive[0].playerId, winnerName: alive[0].playerName };
  }
  return null;
}

function applyAction(state, action, playerId) {
  const events = [];
  const player = state.players.find(p => p.playerId === playerId);
  if (!player || player.isEliminated) return { error: 'Invalid player' };

  // Actions based on phase
  if (state.phase === 'action') {
    if (currentPlayer(state).playerId !== playerId) return { error: 'Not your turn' };
    return handleAction(state, action, player, events);
  }

  if (state.phase === 'counter-action') {
    return handleCounterAction(state, action, player, events);
  }

  if (state.phase === 'challenge') {
    return handleChallenge(state, action, player, events);
  }

  if (state.phase === 'reveal-influence') {
    return handleRevealInfluence(state, action, player, events);
  }

  if (state.phase === 'exchange-select') {
    return handleExchangeSelect(state, action, player, events);
  }

  return { error: 'Cannot act in current phase' };
}

function handleAction(state, action, player, events) {
  const events2 = [];

  if (action.type === 'income') {
    player.coins += 1;
    events2.push(`${player.playerName} takes Income (+1 coin, now ${player.coins})`);
    advanceTurn(state);
    return { events: events2 };
  }

  if (action.type === 'foreign-aid') {
    state.pendingAction = { type: 'foreign-aid', playerId: player.playerId };
    state.phase = 'counter-action';
    state.pendingAction.responses = {};
    events2.push(`${player.playerName} claims Foreign Aid`);
    return { events: events2 };
  }

  if (action.type === 'coup') {
    const target = state.players.find(p => p.playerId === action.targetPlayerId && !p.isEliminated);
    if (!target) return { error: 'Invalid target' };
    if (player.coins < 7) return { error: 'Need 7 coins for Coup' };
    player.coins -= 7;
    state.pendingAction = { type: 'coup', playerId: player.playerId, targetPlayerId: target.playerId };
    state.phase = 'reveal-influence';
    events2.push(`${player.playerName} launches a Coup against ${target.playerName}!`);
    return { events: events2 };
  }

  if (player.coins >= 10) return { error: 'Must perform Coup when you have 10+ coins' };

  if (action.type === 'tax') {
    state.pendingAction = { type: 'tax', playerId: player.playerId, claimedRole: 'duke' };
    state.phase = 'counter-action';
    state.pendingAction.responses = {};
    events2.push(`${player.playerName} claims Tax (Duke)`);
    return { events: events2 };
  }

  if (action.type === 'assassinate') {
    const target = state.players.find(p => p.playerId === action.targetPlayerId && !p.isEliminated);
    if (!target) return { error: 'Invalid target' };
    if (player.coins < 3) return { error: 'Need 3 coins to Assassinate' };
    player.coins -= 3;
    state.pendingAction = { type: 'assassinate', playerId: player.playerId, targetPlayerId: target.playerId, claimedRole: 'assassin' };
    state.phase = 'counter-action';
    state.pendingAction.responses = {};
    events2.push(`${player.playerName} attempts to Assassinate ${target.playerName}!`);
    return { events: events2 };
  }

  if (action.type === 'steal') {
    const target = state.players.find(p => p.playerId === action.targetPlayerId && !p.isEliminated);
    if (!target) return { error: 'Invalid target' };
    if (target.coins === 0) return { error: 'Target has no coins' };
    state.pendingAction = { type: 'steal', playerId: player.playerId, targetPlayerId: target.playerId, claimedRole: 'captain' };
    state.phase = 'counter-action';
    state.pendingAction.responses = {};
    events2.push(`${player.playerName} attempts to Steal from ${target.playerName}!`);
    return { events: events2 };
  }

  if (action.type === 'exchange') {
    state.pendingAction = { type: 'exchange', playerId: player.playerId, claimedRole: 'ambassador' };
    state.phase = 'counter-action';
    state.pendingAction.responses = {};
    events2.push(`${player.playerName} claims Exchange (Ambassador)`);
    return { events: events2 };
  }

  return { error: 'Unknown action' };
}

function handleCounterAction(state, action, player, events) {
  const pending = state.pendingAction;
  if (!pending) return { error: 'No pending action' };

  const otherPlayers = state.players.filter(p => !p.isEliminated && p.playerId !== pending.playerId);
  const evts = [];

  if (action.type === 'pass') {
    pending.responses[player.playerId] = 'pass';
    // Check if all others passed
    const allPassed = otherPlayers.every(p => pending.responses[p.playerId] === 'pass');
    if (allPassed) {
      return resolveAction(state, pending, evts);
    }
    return { events: evts };
  }

  if (action.type === 'challenge') {
    state.phase = 'challenge';
    state.pendingChallenge = { challengerId: player.playerId, challengedId: pending.playerId, challengedRole: pending.claimedRole };
    evts.push(`${player.playerName} challenges ${state.players.find(p => p.playerId === pending.playerId)?.playerName}!`);
    return { events: evts };
  }

  if (action.type === 'block') {
    const blocker = player;
    const actionOwner = state.players.find(p => p.playerId === pending.playerId);

    // Only target can block assassinate
    if (pending.type === 'assassinate' && pending.targetPlayerId !== player.playerId) return { error: 'Only the target can block' };
    if (pending.type === 'steal' && pending.targetPlayerId !== player.playerId) return { error: 'Only the target can block' };

    const blockRoles = {
      'foreign-aid': ['duke'],
      'assassinate': ['contessa'],
      'steal': ['captain', 'ambassador']
    };
    const validRoles = blockRoles[pending.type];
    if (!validRoles) return { error: 'This action cannot be blocked' };
    if (!validRoles.includes(action.claimedRole)) return { error: `Must claim ${validRoles.join(' or ')} to block` };

    state.pendingCounter = { type: 'block', blockerId: player.playerId, claimedRole: action.claimedRole };
    state.phase = 'challenge'; // Action owner can challenge the block
    evts.push(`${blocker.playerName} blocks with ${action.claimedRole}!`);
    return { events: evts };
  }

  return { error: 'Unknown counter action' };
}

function handleChallenge(state, action, player, events) {
  const evts = [];

  if (state.pendingCounter) {
    // Challenging a block
    const blocker = state.players.find(p => p.playerId === state.pendingCounter.blockerId);
    const actionOwner = state.players.find(p => p.playerId === state.pendingAction.playerId);

    if (action.type === 'pass') {
      // Action owner passes on challenging the block — block succeeds
      if (player.playerId !== actionOwner.playerId) return { error: 'Only action owner can pass on block challenge' };
      evts.push(`Block succeeds — action cancelled`);
      // Refund coins if needed
      if (state.pendingAction.type === 'assassinate') {
        actionOwner.coins += 3;
      }
      advanceTurn(state);
      return { events: evts };
    }

    if (action.type === 'challenge' && player.playerId === actionOwner.playerId) {
      const claimedRole = state.pendingCounter.claimedRole;
      const hasRole = blocker.influence.includes(claimedRole);

      if (hasRole) {
        // Challenge fails — action owner loses influence
        evts.push(`${blocker.playerName} reveals ${claimedRole} — challenge fails! ${actionOwner.playerName} must lose an influence`);
        // Replace blocker's card
        const idx = blocker.influence.indexOf(claimedRole);
        blocker.influence.splice(idx, 1);
        state.deck.push(claimedRole);
        state.deck = shuffle(state.deck);
        blocker.influence.push(state.deck.pop());

        state.pendingChallenge = { loserId: actionOwner.playerId };
        state.phase = 'reveal-influence';
        // Block succeeds after loser reveals
        state.pendingAction._blockSucceeded = true;
      } else {
        // Challenge succeeds — blocker loses influence
        evts.push(`${blocker.playerName} cannot show ${claimedRole} — challenge succeeds! ${blocker.playerName} must lose an influence`);
        state.pendingChallenge = { loserId: blocker.playerId };
        state.phase = 'reveal-influence';
        // Action will resolve after loser reveals
      }
      return { events: evts };
    }
    return { error: 'Invalid action in challenge phase' };
  }

  // Challenging the original action
  if (!state.pendingChallenge || !state.pendingChallenge.challengerId) return { error: 'No pending challenge' };
  const challenged = state.players.find(p => p.playerId === state.pendingChallenge.challengedId);
  if (!challenged) return { error: 'No challenged player' };

  if (action.type === 'reveal') {
    const claimedRole = state.pendingChallenge.challengedRole;
    const hasRole = challenged.influence.includes(claimedRole);
    const challenger = state.players.find(p => p.playerId === state.pendingChallenge.challengerId);

    if (hasRole) {
      evts.push(`${challenged.playerName} reveals ${claimedRole} — challenge fails! ${challenger.playerName} must lose an influence`);
      const idx = challenged.influence.indexOf(claimedRole);
      challenged.influence.splice(idx, 1);
      state.deck.push(claimedRole);
      state.deck = shuffle(state.deck);
      challenged.influence.push(state.deck.pop());

      state.pendingChallenge = { loserId: challenger.playerId, afterLoss: 'resolve-action' };
      state.phase = 'reveal-influence';
    } else {
      evts.push(`${challenged.playerName} cannot show ${claimedRole} — challenge succeeds! ${challenged.playerName} must lose an influence`);
      state.pendingChallenge = { loserId: challenged.playerId, afterLoss: 'cancel-action' };
      state.phase = 'reveal-influence';
    }
    return { events: evts };
  }

  return { error: 'Unknown challenge action' };
}

function handleRevealInfluence(state, action, player, events) {
  const evts = [];
  const pending = state.pendingAction;
  const challenge = state.pendingChallenge;

  if (action.type === 'reveal-card') {
    if (!challenge || challenge.loserId !== player.playerId) return { error: 'Not your turn to reveal' };

    loseInfluence(state, player, action.card);
    evts.push(`${player.playerName} reveals and loses ${action.card}`);

    const winResult = checkWin(state);
    if (winResult) return { events: evts, ...winResult };

    if (challenge.afterLoss === 'cancel-action') {
      // Challenged action failed
      if (pending.type === 'assassinate') state.players.find(p => p.playerId === pending.playerId).coins += 3;
      advanceTurn(state);
      return { events: evts };
    }

    if (challenge.afterLoss === 'resolve-action') {
      return resolveAction(state, pending, evts);
    }

    if (pending._blockSucceeded) {
      if (pending.type === 'assassinate') state.players.find(p => p.playerId === pending.playerId).coins += 3;
      advanceTurn(state);
      return { events: evts };
    }

    // Coup or direct reveal
    if (pending.type === 'coup' && pending.targetPlayerId === player.playerId) {
      const winR = checkWin(state);
      if (winR) return { events: evts, ...winR };
      advanceTurn(state);
      return { events: evts };
    }

    if (pending.type === 'assassinate' && pending.targetPlayerId === player.playerId) {
      const winR = checkWin(state);
      if (winR) return { events: evts, ...winR };
      advanceTurn(state);
      return { events: evts };
    }

    advanceTurn(state);
    return { events: evts };
  }

  return { error: 'Must reveal a card' };
}

function handleExchangeSelect(state, action, player, events) {
  const pending = state.pendingAction;
  if (!pending || pending.type !== 'exchange') return { error: 'No pending exchange' };
  if (pending.playerId !== player.playerId) return { error: 'Not your exchange' };

  const evts = [];
  const keep = action.keep; // Array of 2 role names to keep
  if (!Array.isArray(keep) || keep.length !== player.influence.length) return { error: 'Invalid selection' };

  const combined = [...player.influence, ...pending.drawnCards];
  for (const card of keep) {
    const idx = combined.indexOf(card);
    if (idx === -1) return { error: `Card ${card} not available` };
    combined.splice(idx, 1);
  }

  // Return remaining to deck
  for (const card of combined) {
    state.deck.push(card);
  }
  state.deck = shuffle(state.deck);
  player.influence = keep;

  evts.push(`${player.playerName} completed Exchange`);
  advanceTurn(state);
  return { events: evts };
}

function resolveAction(state, pending, evts) {
  const actor = state.players.find(p => p.playerId === pending.playerId);
  const target = pending.targetPlayerId ? state.players.find(p => p.playerId === pending.targetPlayerId) : null;

  if (pending.type === 'income') {
    actor.coins += 1;
  } else if (pending.type === 'foreign-aid') {
    actor.coins += 2;
    evts.push(`${actor.playerName} takes Foreign Aid (+2 coins, now ${actor.coins})`);
  } else if (pending.type === 'tax') {
    actor.coins += 3;
    evts.push(`${actor.playerName} takes Tax (+3 coins, now ${actor.coins})`);
  } else if (pending.type === 'assassinate') {
    if (target && !target.isEliminated) {
      state.pendingChallenge = { loserId: target.playerId };
      state.phase = 'reveal-influence';
      evts.push(`${target.playerName} must reveal an influence!`);
      return { events: evts };
    }
  } else if (pending.type === 'steal') {
    if (target) {
      const stolen = Math.min(target.coins, 2);
      target.coins -= stolen;
      actor.coins += stolen;
      evts.push(`${actor.playerName} steals ${stolen} coins from ${target.playerName}`);
    }
  } else if (pending.type === 'exchange') {
    const drawn = [state.deck.pop(), state.deck.pop()];
    pending.drawnCards = drawn;
    state.phase = 'exchange-select';
    evts.push(`${actor.playerName} draws cards to exchange`);
    return { events: evts };
  }

  advanceTurn(state);
  return { events: evts };
}

function getPublicState(state, forPlayerId) {
  const me = state.players.find(p => p.playerId === forPlayerId);
  return {
    players: state.players.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      coins: p.coins,
      influenceCount: p.influence.length,
      influence: p.playerId === forPlayerId ? p.influence : undefined,
      lostInfluence: p.lostInfluence,
      isEliminated: p.isEliminated
    })),
    currentTurnIndex: state.currentTurnIndex,
    currentTurnPlayerId: state.players[state.currentTurnIndex]?.playerId,
    phase: state.phase,
    pendingAction: state.pendingAction ? {
      type: state.pendingAction.type,
      playerId: state.pendingAction.playerId,
      targetPlayerId: state.pendingAction.targetPlayerId,
      claimedRole: state.pendingAction.claimedRole,
      responses: state.pendingAction.responses,
      drawnCards: state.pendingAction.playerId === forPlayerId ? state.pendingAction.drawnCards : undefined
    } : null,
    pendingCounter: state.pendingCounter,
    pendingChallenge: state.pendingChallenge ? {
      challengerId: state.pendingChallenge.challengerId,
      challengedId: state.pendingChallenge.challengedId,
      loserId: state.pendingChallenge.loserId
    } : null,
    isMyTurn: state.players[state.currentTurnIndex]?.playerId === forPlayerId,
    myInfluence: me ? me.influence : [],
    status: state.status,
    winner: state.winner
  };
}

module.exports = { minPlayers, maxPlayers, initState, applyAction, getPublicState };
