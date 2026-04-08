'use strict';

/**
 * ItoGame — domain aggregate for an ITO cooperative game session.
 *
 * Phases:
 *   describing   — each player types a description for each of their cards
 *   ordering     — players collectively arrange all cards in order (no values visible)
 *   round-result — reveal values, show if order was correct
 *   finished     — game over (team won or lost all lives)
 */

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const MAX_LIVES   = 3;
const MAX_ROUNDS  = 3; // complete this many rounds to win

const THEMES = [
  'Coisas quentes', 'Coisas geladas', 'Coisas que queimam', 'Lugares frios do mundo',
  'Bebidas pela temperatura', 'Coisas que derretem fácil',
  'Coisas grandes', 'Coisas pesadas', 'Coisas pequenas que ainda dá pra ver',
  'Coisas altas', 'Coisas longas', 'Coisas largas', 'Animais grandes',
  'Construções altas', 'Coisas finas', 'Coisas profundas',
  'Coisas rápidas', 'Coisas lentas', 'Meios de transporte por velocidade',
  'Animais velozes', 'Esportes pela intensidade', 'Coisas que voam alto',
  'Coisas caras', 'Coisas baratas que valem a pena', 'Profissões pelo salário',
  'Itens de supermercado por preço', 'Carros por preço',
  'Coisas assustadoras', 'Animais perigosos', 'Filmes de terror pelo medo que dão',
  'Situações constrangedoras', 'Doenças pela gravidade', 'Insetos pelo nojo',
  'Coisas doces', 'Coisas apimentadas', 'Coisas salgadas', 'Coisas amargas',
  'Coisas azedas', 'Comidas calóricas', 'Frutas pela doçura', 'Comidas exóticas pela estranheza',
  'Famosos mais conhecidos no mundo', 'Filmes mais assistidos',
  'Músicas mais tocadas', 'Esportes mais praticados', 'Livros mais vendidos',
  'Marcas mais reconhecidas', 'Países mais visitados',
  'Coisas que dão felicidade', 'Coisas que dão raiva', 'Coisas que dão saudade',
  'Coisas relaxantes', 'Coisas estressantes', 'Coisas fofas',
  'Coisas que dão orgulho', 'Coisas nostálgicas', 'Coisas irritantes do dia a dia',
  'Coisas difíceis de aprender', 'Esportes difíceis de praticar',
  'Idiomas difíceis', 'Jogos pela dificuldade', 'Desafios físicos',
  'Coisas que duram pouco', 'Coisas eternas', 'Tarefas domésticas pelo tempo gasto',
  'Coisas raras de encontrar', 'Animais em extinção',
  'Eventos que acontecem uma vez na vida', 'Pedras preciosas',
  'Coisas úteis no dia a dia', 'Apps mais usados', 'Invenções que mudaram o mundo',
  'Lugares bonitos para visitar', 'Paisagens naturais impressionantes',
  'Coisas barulhentas', 'Coisas fedidas', 'Coisas brilhantes', 'Coisas que grudam',
  'Sobremesas pelo sabor', 'Pratos pela dificuldade de preparo',
  'Profissões pela dificuldade de formação', 'Presentes inesquecíveis pelo valor',
  'Momentos vergonhosos', 'Coincidências improváveis',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickTheme(usedThemes) {
  const available = THEMES.filter(t => !usedThemes.includes(t));
  const pool = available.length > 0 ? available : THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function dealRound(players, cardsPerPlayer) {
  const total = players.length * cardsPerPlayer;
  const deck  = shuffle(Array.from({ length: 100 }, (_, i) => i + 1));
  const dealt  = shuffle(deck.slice(0, total));

  const hands = {};
  let idx = 0;
  for (const p of players) {
    hands[p.playerId] = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hands[p.playerId].push({ value: dealt[idx++], description: null });
    }
  }
  return hands;
}

function buildInitialOrder(players, hands) {
  const order = [];
  for (const p of players) {
    hands[p.playerId].forEach((_, cardIdx) => order.push({ playerId: p.playerId, cardIdx }));
  }
  return shuffle(order);
}

function addLog(state, message) {
  state.log.push({ message, timestamp: Date.now() });
  if (state.log.length > 40) state.log.shift();
}

// ── Public API ────────────────────────────────────────────────────────────────

function initState(players) {
  const theme = pickTheme([]);
  const hands = dealRound(players, 1);

  const state = {
    players:       players.map(p => ({ playerId: p.playerId, playerName: p.playerName })),
    lives:         MAX_LIVES,
    round:         1,
    cardsPerPlayer: 1,
    theme,
    usedThemes:    [theme],
    hands,
    describedBy:   [],       // playerIds who have submitted all descriptions
    proposedOrder: buildInitialOrder(players, hands),
    revealResults: null,
    roundSuccess:  null,
    phase:         'describing',
    log:           [],
    status:        'playing',
    teamWon:       null,
    winner:        null,
    winnerName:    null,
  };

  addLog(state, `Rodada 1 — Tema: "${theme}" — 1 carta por jogador`);
  return state;
}

function applyAction(state, action, playerId) {
  const playerIdx = state.players.findIndex(p => p.playerId === playerId);
  if (playerIdx === -1) return { error: 'Jogador não encontrado' };

  const player = state.players[playerIdx];

  // ── describing ─────────────────────────────────────────────────────────────
  if (state.phase === 'describing') {
    if (action.type !== 'describe') return { error: 'Aguarde a fase de descrição' };
    if (state.describedBy.includes(playerId)) return { error: 'Você já enviou suas descrições' };

    const { descriptions } = action;
    const hand = state.hands[playerId];

    if (!Array.isArray(descriptions) || descriptions.length !== hand.length) {
      return { error: `Envie exatamente ${hand.length} descrição(ões)` };
    }
    for (const { cardIdx, text } of descriptions) {
      if (cardIdx < 0 || cardIdx >= hand.length) return { error: 'Índice de carta inválido' };
      const t = (text || '').trim();
      if (!t)         return { error: 'Descrição não pode estar vazia' };
      if (t.length > 80) return { error: 'Descrição muito longa (máx 80 caracteres)' };
      // Basic anti-cheat: block explicit numbers and ranges
      if (/\b\d{1,3}\b/.test(t)) return { error: 'Não é permitido usar números na descrição' };
      hand[cardIdx].description = t;
    }

    state.describedBy.push(playerId);
    addLog(state, `${player.playerName} enviou sua(s) descrição(ões).`);

    if (state.describedBy.length === state.players.length) {
      state.phase = 'ordering';
      // proposedOrder was already built at round start; just keep it
      addLog(state, 'Todos descreveram! Agora ordenem as cartas.');
    }
    return {};
  }

  // ── ordering ───────────────────────────────────────────────────────────────
  if (state.phase === 'ordering') {
    if (action.type === 'reorder') {
      const { order } = action;
      if (!Array.isArray(order)) return { error: 'Ordem inválida' };

      // Validate same set of (playerId, cardIdx)
      const canonical = (arr) => arr.map(x => `${x.playerId}:${x.cardIdx}`).sort().join(',');
      if (canonical(order) !== canonical(state.proposedOrder)) {
        return { error: 'Ordem inválida: elementos não correspondem' };
      }

      state.proposedOrder = order;
      return {};
    }

    if (action.type === 'confirm-order') {
      // Score the round
      const results = state.proposedOrder.map(({ playerId: pid, cardIdx }) => ({
        playerId:    pid,
        playerName:  state.players.find(p => p.playerId === pid)?.playerName,
        cardIdx,
        value:       state.hands[pid][cardIdx].value,
        description: state.hands[pid][cardIdx].description,
      }));

      // Mark correct/incorrect based on strict ascending order
      const values = results.map(r => r.value);
      for (let i = 0; i < results.length; i++) {
        const okPrev = i === 0 || values[i] > values[i - 1];
        const okNext = i === results.length - 1 || values[i] < values[i + 1];
        results[i].correct = okPrev && okNext;
      }

      const allCorrect = results.every(r => r.correct);
      state.revealResults = results;
      state.roundSuccess  = allCorrect;
      state.phase         = 'round-result';

      if (allCorrect) {
        addLog(state, `Perfeito! Todas as ${results.length} cartas em ordem correta!`);
      } else {
        state.lives--;
        addLog(state, `Ordem incorreta! -1 vida. Vidas restantes: ${state.lives}.`);
      }

      // ── Win / loss check ──────────────────────────────────────────────────
      if (state.lives <= 0) {
        state.status   = 'finished';
        state.teamWon  = false;
        state.phase    = 'finished';
        state.winner   = null;
        state.winnerName = null;
        addLog(state, 'Sem mais vidas. O time perdeu!');
        return { gameOver: true, winner: null, winnerName: null, teamWin: false, reason: 'O time perdeu todas as vidas' };
      }

      if (allCorrect && state.round >= MAX_ROUNDS) {
        state.status   = 'finished';
        state.teamWon  = true;
        state.phase    = 'finished';
        state.winner   = 'team';
        state.winnerName = 'Time';
        addLog(state, `Parabéns! O time completou todas as ${MAX_ROUNDS} rodadas!`);
        return { gameOver: true, winner: 'team', winnerName: 'Time', teamWin: true, reason: `Completaram ${MAX_ROUNDS} rodadas com sucesso!` };
      }

      return {};
    }

    return { error: 'Ação inválida nesta fase' };
  }

  // ── round-result ───────────────────────────────────────────────────────────
  if (state.phase === 'round-result') {
    if (action.type !== 'next-round') return { error: 'Aguarde a próxima rodada' };

    state.round++;
    state.cardsPerPlayer++;
    state.describedBy   = [];
    state.revealResults = null;
    state.roundSuccess  = null;

    const newTheme = pickTheme(state.usedThemes);
    state.theme = newTheme;
    state.usedThemes.push(newTheme);

    state.hands = dealRound(state.players, state.cardsPerPlayer);
    state.proposedOrder = buildInitialOrder(state.players, state.hands);
    state.phase = 'describing';

    addLog(state, `Rodada ${state.round} — Tema: "${newTheme}" — ${state.cardsPerPlayer} cartas por jogador`);
    return {};
  }

  return { error: 'Fase inválida' };
}

function getPublicState(state, forPlayerId) {
  const myHand = state.hands[forPlayerId] || [];

  // In ordering/result phases all descriptions are visible; in describing phase
  // each player can see their own + already-submitted players' descriptions
  const allCards = (state.phase === 'ordering' || state.phase === 'round-result' || state.phase === 'finished')
    ? state.proposedOrder.map(({ playerId: pid, cardIdx }, i) => {
        const card   = state.hands[pid]?.[cardIdx];
        const owner  = state.players.find(p => p.playerId === pid);
        const result = state.revealResults?.[i];
        return {
          posIdx:      i,
          playerId:    pid,
          playerName:  owner?.playerName,
          cardIdx,
          description: card?.description,
          isMyCard:    pid === forPlayerId,
          value:       (state.phase === 'round-result' || state.phase === 'finished') ? card?.value : null,
          correct:     result?.correct ?? null,
        };
      })
    : [];

  return {
    phase:          state.phase,
    lives:          state.lives,
    maxLives:       MAX_LIVES,
    round:          state.round,
    maxRounds:      MAX_ROUNDS,
    cardsPerPlayer: state.cardsPerPlayer,
    theme:          state.theme,
    myPlayerId:     forPlayerId,

    players: state.players.map(p => ({
      playerId:     p.playerId,
      playerName:   p.playerName,
      hasDescribed: state.describedBy.includes(p.playerId),
    })),

    myHand: myHand.map((card, idx) => ({
      idx,
      value:       card.value,
      description: card.description,
    })),

    allCards,

    iAmDescribed:  state.describedBy.includes(forPlayerId),
    roundSuccess:  state.roundSuccess,
    revealResults: state.revealResults,

    log:        state.log.slice(-20),
    status:     state.status,
    teamWon:    state.teamWon,
    winner:     state.winner,
    winnerName: state.winnerName,
  };
}

module.exports = { initState, applyAction, getPublicState, MIN_PLAYERS, MAX_PLAYERS };
