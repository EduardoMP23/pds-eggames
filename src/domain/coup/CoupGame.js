'use strict';

/**
 * CoupGame — domain aggregate for a Coup game session.
 *
 * Pure module: no I/O, no side-effects.
 *
 * Phases:
 *   action               — current player picks an action
 *   await-reactions      — other players can challenge/block/pass
 *   await-block-reactions— actor (+others) can challenge a block or pass
 *   await-lose-influence — a specific player must reveal a card
 *   await-exchange       — actor picks which cards to keep
 */

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

const ROLES = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];

// Role required to perform each character action
const ACTION_ROLE = {
  tax: 'duke',
  assassinate: 'assassin',
  steal: 'captain',
  exchange: 'ambassador',
};

// Which roles can block each action, and whether only the target can block
const BLOCK_RULES = {
  'foreign-aid': { roles: ['duke'], targetOnly: false },
  assassinate:   { roles: ['contessa'], targetOnly: true },
  steal:         { roles: ['captain', 'ambassador'], targetOnly: true },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeck() {
  const deck = [];
  for (const role of ROLES) deck.push(role, role, role); // 3 copies each
  return shuffle(deck);
}

function isEliminated(player) {
  return player.influence.every(c => c.revealed);
}

function activePlayers(state) {
  return state.players.filter(p => !isEliminated(p));
}

function addLog(state, message) {
  state.log.push({ message, timestamp: Date.now() });
  if (state.log.length > 50) state.log.shift();
}

function drawFromDeck(state, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length > 0) drawn.push(state.deck.pop());
  }
  return drawn;
}

function returnToDeck(state, roles) {
  for (const role of roles) state.deck.push(role);
  state.deck = shuffle(state.deck);
}

// ── Turn / phase transitions ───────────────────────────────────────────────────

function endTurn(state) {
  const active = activePlayers(state);
  if (active.length === 1) {
    state.status = 'finished';
    state.winner = active[0].playerId;
    state.winnerName = active[0].playerName;
    state.phase = 'finished';
    return { gameOver: true, winner: state.winner, winnerName: state.winnerName, reason: 'Último jogador em pé' };
  }

  // Advance to next active player
  let nextIdx = (state.currentTurnIndex + 1) % state.players.length;
  while (isEliminated(state.players[nextIdx])) {
    nextIdx = (nextIdx + 1) % state.players.length;
  }
  state.currentTurnIndex = nextIdx;
  state.phase = 'action';
  state.pendingAction = null;
  state.pendingBlock = null;
  state.awaitingFrom = [];
  state.pendingLoss = null;
  state.exchangeOptions = null;
  return {};
}

function startReactionPhase(state) {
  const actor = state.players[state.pendingAction.actorIdx];
  const awaiting = activePlayers(state)
    .filter(p => p.playerId !== actor.playerId)
    .map(p => p.playerId);

  if (awaiting.length === 0) return executeAction(state);

  state.awaitingFrom = awaiting;
  state.phase = 'await-reactions';
  return {};
}

function executeAction(state) {
  const { pendingAction } = state;
  if (!pendingAction) return endTurn(state);

  const actor = state.players[pendingAction.actorIdx];

  switch (pendingAction.type) {
    case 'income':
      actor.coins += 1;
      addLog(state, `${actor.playerName} pegou renda (+1 moeda).`);
      return endTurn(state);

    case 'foreign-aid':
      actor.coins += 2;
      addLog(state, `${actor.playerName} pegou ajuda externa (+2 moedas).`);
      return endTurn(state);

    case 'coup': {
      // Coins already deducted; just ask target to lose influence
      const target = state.players[pendingAction.targetIdx];
      state.pendingLoss = { playerIdx: pendingAction.targetIdx, next: 'end-turn' };
      state.phase = 'await-lose-influence';
      return {};
    }

    case 'tax':
      actor.coins += 3;
      addLog(state, `${actor.playerName} cobrou taxa como Duque (+3 moedas).`);
      return endTurn(state);

    case 'assassinate': {
      const target = state.players[pendingAction.targetIdx];
      addLog(state, `O assassinato de ${actor.playerName} contra ${target.playerName} será executado.`);
      // Check if target is already eliminated (edge case with double loss)
      if (isEliminated(target)) return endTurn(state);
      state.pendingLoss = { playerIdx: pendingAction.targetIdx, next: 'end-turn' };
      state.phase = 'await-lose-influence';
      return {};
    }

    case 'steal': {
      const target = state.players[pendingAction.targetIdx];
      const stolen = Math.min(2, target.coins);
      target.coins -= stolen;
      actor.coins += stolen;
      addLog(state, `${actor.playerName} roubou ${stolen} moeda(s) de ${target.playerName}.`);
      return endTurn(state);
    }

    case 'exchange': {
      const hand = actor.influence.filter(c => !c.revealed).map(c => c.role);
      const drawn = drawFromDeck(state, 2);
      state.exchangeOptions = [...hand, ...drawn];
      addLog(state, `${actor.playerName} está trocando cartas como Embaixador.`);
      state.awaitingFrom = [];
      state.phase = 'await-exchange';
      return {};
    }

    default:
      return { error: 'Tipo de ação desconhecido' };
  }
}

// ── Action handlers per phase ─────────────────────────────────────────────────

function handleActionPhase(state, action, playerIdx) {
  if (playerIdx !== state.currentTurnIndex) return { error: 'Não é sua vez' };

  const player = state.players[playerIdx];

  if (player.coins >= 10 && action.type !== 'coup') {
    return { error: 'Com 10 ou mais moedas você é obrigado a dar Golpe de Estado' };
  }

  switch (action.type) {
    case 'income': {
      state.pendingAction = { actorIdx: playerIdx, type: 'income', targetIdx: null, claimedRole: null };
      addLog(state, `${player.playerName} pegou renda.`);
      return startReactionPhase(state);
    }

    case 'foreign-aid': {
      state.pendingAction = { actorIdx: playerIdx, type: 'foreign-aid', targetIdx: null, claimedRole: null };
      addLog(state, `${player.playerName} tenta pegar ajuda externa.`);
      return startReactionPhase(state);
    }

    case 'coup': {
      if (player.coins < 7) return { error: 'Você precisa de 7 moedas para dar Golpe de Estado' };
      const targetIdx = state.players.findIndex(p => p.playerId === action.targetId);
      if (targetIdx === -1 || isEliminated(state.players[targetIdx])) return { error: 'Alvo inválido' };
      if (targetIdx === playerIdx) return { error: 'Você não pode dar golpe em si mesmo' };
      player.coins -= 7;
      const target = state.players[targetIdx];
      addLog(state, `${player.playerName} deu Golpe de Estado em ${target.playerName}!`);
      state.pendingAction = { actorIdx: playerIdx, type: 'coup', targetIdx, claimedRole: null };
      state.pendingLoss = { playerIdx: targetIdx, next: 'end-turn' };
      state.phase = 'await-lose-influence';
      return {};
    }

    case 'tax': {
      state.pendingAction = { actorIdx: playerIdx, type: 'tax', targetIdx: null, claimedRole: 'duke' };
      addLog(state, `${player.playerName} alega ser o Duque e cobra taxa.`);
      return startReactionPhase(state);
    }

    case 'assassinate': {
      if (player.coins < 3) return { error: 'Você precisa de 3 moedas para assassinar' };
      const targetIdx = state.players.findIndex(p => p.playerId === action.targetId);
      if (targetIdx === -1 || isEliminated(state.players[targetIdx])) return { error: 'Alvo inválido' };
      if (targetIdx === playerIdx) return { error: 'Você não pode se assassinar' };
      player.coins -= 3;
      const target = state.players[targetIdx];
      state.pendingAction = { actorIdx: playerIdx, type: 'assassinate', targetIdx, claimedRole: 'assassin' };
      addLog(state, `${player.playerName} paga 3 moedas e alega ser o Assassino — alvo: ${target.playerName}.`);
      return startReactionPhase(state);
    }

    case 'steal': {
      const targetIdx = state.players.findIndex(p => p.playerId === action.targetId);
      if (targetIdx === -1 || isEliminated(state.players[targetIdx])) return { error: 'Alvo inválido' };
      if (targetIdx === playerIdx) return { error: 'Você não pode roubar de si mesmo' };
      const target = state.players[targetIdx];
      state.pendingAction = { actorIdx: playerIdx, type: 'steal', targetIdx, claimedRole: 'captain' };
      addLog(state, `${player.playerName} alega ser o Capitão e tenta roubar de ${target.playerName}.`);
      return startReactionPhase(state);
    }

    case 'exchange': {
      state.pendingAction = { actorIdx: playerIdx, type: 'exchange', targetIdx: null, claimedRole: 'ambassador' };
      addLog(state, `${player.playerName} alega ser o Embaixador e tenta trocar cartas.`);
      return startReactionPhase(state);
    }

    default:
      return { error: 'Ação inválida' };
  }
}

function handleReactionPhase(state, action, playerIdx) {
  const player = state.players[playerIdx];
  if (!state.awaitingFrom.includes(player.playerId)) {
    return { error: 'Não é sua vez de reagir' };
  }

  if (action.type === 'pass') {
    state.awaitingFrom = state.awaitingFrom.filter(id => id !== player.playerId);
    addLog(state, `${player.playerName} passou.`);
    if (state.awaitingFrom.length === 0) return executeAction(state);
    return {};
  }

  if (action.type === 'challenge') {
    if (!state.pendingAction.claimedRole) return { error: 'Esta ação não pode ser contestada' };
    const actor = state.players[state.pendingAction.actorIdx];
    addLog(state, `${player.playerName} contesta ${actor.playerName}!`);

    const cardIdx = actor.influence.findIndex(c => !c.revealed && c.role === state.pendingAction.claimedRole);
    if (cardIdx !== -1) {
      // Actor had the card — challenger loses; actor replaces card
      addLog(state, `${actor.playerName} revelou ${state.pendingAction.claimedRole}! ${player.playerName} perde uma influência.`);
      const oldRole = actor.influence[cardIdx].role;
      returnToDeck(state, [oldRole]);
      const [newRole] = drawFromDeck(state, 1);
      if (newRole) actor.influence[cardIdx] = { role: newRole, revealed: false };
      state.pendingLoss = { playerIdx, next: 'execute-action' };
    } else {
      // Actor was bluffing — actor loses; action fails
      addLog(state, `${actor.playerName} estava blefando! Perde uma influência.`);
      if (state.pendingAction.type === 'assassinate') actor.coins += 3; // refund
      state.pendingLoss = { playerIdx: state.pendingAction.actorIdx, next: 'end-turn' };
    }
    state.awaitingFrom = [];
    state.phase = 'await-lose-influence';
    return {};
  }

  if (action.type === 'block') {
    const { claimedRole } = action;
    const { type: actionType, targetIdx } = state.pendingAction;
    const blockRule = BLOCK_RULES[actionType];
    if (!blockRule) return { error: 'Esta ação não pode ser bloqueada' };
    if (!blockRule.roles.includes(claimedRole)) {
      return { error: `${claimedRole} não pode bloquear esta ação` };
    }
    if (blockRule.targetOnly && targetIdx !== playerIdx) {
      return { error: 'Só o alvo pode bloquear esta ação' };
    }

    const actor = state.players[state.pendingAction.actorIdx];
    addLog(state, `${player.playerName} alega ser ${claimedRole} e bloqueia a ação!`);
    state.pendingBlock = { blockerIdx: playerIdx, claimedRole };
    state.awaitingFrom = [];

    // Everyone except the blocker can challenge the block
    state.awaitingFrom = activePlayers(state)
      .filter(p => p.playerId !== player.playerId)
      .map(p => p.playerId);
    state.phase = 'await-block-reactions';
    return {};
  }

  return { error: 'Resposta inválida' };
}

function handleBlockReactionPhase(state, action, playerIdx) {
  const player = state.players[playerIdx];
  if (!state.awaitingFrom.includes(player.playerId)) {
    return { error: 'Não é sua vez de reagir ao bloqueio' };
  }

  if (action.type === 'pass') {
    state.awaitingFrom = state.awaitingFrom.filter(id => id !== player.playerId);
    addLog(state, `${player.playerName} aceitou o bloqueio.`);
    if (state.awaitingFrom.length === 0) {
      // All passed — block succeeds, end turn
      addLog(state, `O bloqueio foi aceito. Ação cancelada.`);
      return endTurn(state);
    }
    return {};
  }

  if (action.type === 'challenge') {
    const blocker = state.players[state.pendingBlock.blockerIdx];
    addLog(state, `${player.playerName} contesta o bloqueio de ${blocker.playerName}!`);

    const cardIdx = blocker.influence.findIndex(c => !c.revealed && c.role === state.pendingBlock.claimedRole);
    if (cardIdx !== -1) {
      // Blocker had the card — challenger loses; blocker replaces card; block stands
      addLog(state, `${blocker.playerName} revelou ${state.pendingBlock.claimedRole}! ${player.playerName} perde uma influência.`);
      const oldRole = blocker.influence[cardIdx].role;
      returnToDeck(state, [oldRole]);
      const [newRole] = drawFromDeck(state, 1);
      if (newRole) blocker.influence[cardIdx] = { role: newRole, revealed: false };
      state.pendingLoss = { playerIdx, next: 'end-turn' };
    } else {
      // Blocker was bluffing — blocker loses; original action executes
      addLog(state, `${blocker.playerName} estava blefando o bloqueio! Perde uma influência.`);
      const next = state.pendingAction.type === 'assassinate' ? 'target-loses-too' : 'execute-action';
      state.pendingLoss = { playerIdx: state.pendingBlock.blockerIdx, next };
    }
    state.awaitingFrom = [];
    state.phase = 'await-lose-influence';
    return {};
  }

  return { error: 'Resposta inválida ao bloqueio' };
}

function handleLoseInfluencePhase(state, action, playerIdx) {
  if (!state.pendingLoss || state.pendingLoss.playerIdx !== playerIdx) {
    return { error: 'Não é você que precisa perder influência agora' };
  }
  const player = state.players[playerIdx];
  const { cardIndex } = action;
  if (cardIndex === undefined || cardIndex === null) return { error: 'Escolha qual carta revelar' };
  if (!player.influence[cardIndex]) return { error: 'Carta inválida' };
  if (player.influence[cardIndex].revealed) return { error: 'Esta carta já está revelada' };

  player.influence[cardIndex].revealed = true;
  addLog(state, `${player.playerName} revelou ${player.influence[cardIndex].role}.`);

  const { next } = state.pendingLoss;
  state.pendingLoss = null;

  if (isEliminated(player)) {
    addLog(state, `${player.playerName} foi eliminado!`);
  }

  if (next === 'end-turn') return endTurn(state);
  if (next === 'execute-action') return executeAction(state);
  if (next === 'target-loses-too') {
    if (!isEliminated(player)) {
      addLog(state, `O assassinato prossegue — ${player.playerName} perde mais uma influência.`);
      state.pendingLoss = { playerIdx, next: 'end-turn' };
      state.phase = 'await-lose-influence';
      return {};
    }
    return endTurn(state);
  }
  return endTurn(state);
}

function handleExchangePhase(state, action, playerIdx) {
  if (state.pendingAction?.actorIdx !== playerIdx) {
    return { error: 'Não é você que está trocando cartas' };
  }
  const player = state.players[playerIdx];
  const options = state.exchangeOptions;
  const unrevealedCount = player.influence.filter(c => !c.revealed).length;
  const { keep } = action;

  if (!Array.isArray(keep) || keep.length !== unrevealedCount) {
    return { error: `Escolha exatamente ${unrevealedCount} carta(s) para manter` };
  }
  if (new Set(keep).size !== keep.length) return { error: 'Escolha cartas diferentes' };
  if (keep.some(i => i < 0 || i >= options.length)) return { error: 'Índice de carta inválido' };

  const kept = keep.map(i => options[i]);
  const returned = options.filter((_, i) => !keep.includes(i));

  let keptIdx = 0;
  for (let i = 0; i < player.influence.length; i++) {
    if (!player.influence[i].revealed) {
      player.influence[i] = { role: kept[keptIdx++], revealed: false };
    }
  }
  returnToDeck(state, returned);
  state.exchangeOptions = null;
  addLog(state, `${player.playerName} trocou ${returned.length} carta(s).`);
  return endTurn(state);
}

// ── Public API ────────────────────────────────────────────────────────────────

function initState(players) {
  const deck = makeDeck();
  const gamePlayers = players.map(p => ({
    playerId: p.playerId,
    playerName: p.playerName,
    coins: 2,
    influence: [
      { role: deck.pop(), revealed: false },
      { role: deck.pop(), revealed: false },
    ],
  }));

  return {
    players: gamePlayers,
    deck,
    currentTurnIndex: 0,
    phase: 'action',
    pendingAction: null,
    awaitingFrom: [],
    pendingBlock: null,
    pendingLoss: null,
    exchangeOptions: null,
    log: [],
    status: 'playing',
    winner: null,
    winnerName: null,
  };
}

function applyAction(state, action, playerId) {
  const playerIdx = state.players.findIndex(p => p.playerId === playerId);
  if (playerIdx === -1) return { error: 'Jogador não encontrado' };
  if (isEliminated(state.players[playerIdx])) return { error: 'Você está eliminado' };

  switch (state.phase) {
    case 'action':              return handleActionPhase(state, action, playerIdx);
    case 'await-reactions':     return handleReactionPhase(state, action, playerIdx);
    case 'await-block-reactions': return handleBlockReactionPhase(state, action, playerIdx);
    case 'await-lose-influence': return handleLoseInfluencePhase(state, action, playerIdx);
    case 'await-exchange':      return handleExchangePhase(state, action, playerIdx);
    default: return { error: 'Fase inválida' };
  }
}

function getPublicState(state, forPlayerId) {
  const myIdx = state.players.findIndex(p => p.playerId === forPlayerId);

  return {
    phase: state.phase,
    myPlayerId: forPlayerId,
    myTurn: myIdx === state.currentTurnIndex && state.phase === 'action',
    currentTurnPlayerId: state.players[state.currentTurnIndex]?.playerId,
    players: state.players.map((p, idx) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      coins: p.coins,
      influenceCount: p.influence.filter(c => !c.revealed).length,
      influence: p.influence.map(c => ({
        role: (c.revealed || p.playerId === forPlayerId) ? c.role : 'unknown',
        revealed: c.revealed,
      })),
      eliminated: isEliminated(p),
      isCurrentTurn: idx === state.currentTurnIndex,
    })),
    pendingAction: state.pendingAction ? {
      actorPlayerId: state.players[state.pendingAction.actorIdx].playerId,
      actorName:     state.players[state.pendingAction.actorIdx].playerName,
      type:          state.pendingAction.type,
      targetPlayerId: state.pendingAction.targetIdx !== null
        ? state.players[state.pendingAction.targetIdx].playerId : null,
      targetName: state.pendingAction.targetIdx !== null
        ? state.players[state.pendingAction.targetIdx].playerName : null,
      claimedRole: state.pendingAction.claimedRole,
    } : null,
    pendingBlock: state.pendingBlock ? {
      blockerPlayerId: state.players[state.pendingBlock.blockerIdx].playerId,
      blockerName:     state.players[state.pendingBlock.blockerIdx].playerName,
      claimedRole:     state.pendingBlock.claimedRole,
    } : null,
    iAmAwaiting:        state.awaitingFrom.includes(forPlayerId),
    awaitingFromNames:  state.awaitingFrom.map(id => state.players.find(p => p.playerId === id)?.playerName).filter(Boolean),
    mustLoseInfluence:  state.pendingLoss?.playerIdx === myIdx,
    exchangeOptions:    (state.phase === 'await-exchange' && state.pendingAction?.actorIdx === myIdx)
      ? state.exchangeOptions : null,
    log:        state.log.slice(-20),
    status:     state.status,
    winner:     state.winner,
    winnerName: state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, MIN_PLAYERS, MAX_PLAYERS };
