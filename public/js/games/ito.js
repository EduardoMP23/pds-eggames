(function () {
  // ── Module state ─────────────────────────────────────────────────────────────
  let _el          = null;
  let _myPlayerId  = null;
  let _sendAction  = null;
  let _lastState   = null;

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init(el, myPlayerId) {
    _el = el;
    _myPlayerId = myPlayerId;
    _el.innerHTML = `
      <div class="ito-layout">
        <div class="ito-header" id="itoHeader"></div>
        <div class="ito-body">
          <div class="ito-main" id="itoMain"></div>
          <div class="ito-log"  id="itoLog"></div>
        </div>
      </div>
    `;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(state, sendAction) {
    _sendAction = sendAction;
    _lastState  = state;

    renderHeader(state);
    renderMain(state);
    renderLog(state);
  }

  // ── Header ────────────────────────────────────────────────────────────────────
  function renderHeader(state) {
    const el = document.getElementById('itoHeader');
    if (!el) return;

    const hearts = Array.from({ length: state.maxLives }, (_, i) =>
      `<span class="ito-heart ${i < state.lives ? 'alive' : 'lost'}">♥</span>`
    ).join('');

    const players = state.players.map(p =>
      `<span class="ito-player-badge ${p.hasDescribed ? 'described' : ''}">
        ${esc(p.playerName)}${p.hasDescribed ? ' ✓' : ''}
      </span>`
    ).join('');

    el.innerHTML = `
      <div class="ito-meta">
        <span class="ito-round">Rodada ${state.round}/${state.maxRounds}</span>
        <span class="ito-lives">${hearts}</span>
        <span class="ito-cards-label">${state.cardsPerPlayer} carta(s)/jogador</span>
      </div>
      <div class="ito-theme">
        <span class="ito-theme-label">Tema</span>
        <span class="ito-theme-value">${esc(state.theme)}</span>
      </div>
      <div class="ito-players-status">${players}</div>
    `;
  }

  // ── Main area (phase-dependent) ───────────────────────────────────────────────
  function renderMain(state) {
    const el = document.getElementById('itoMain');
    if (!el) return;

    switch (state.phase) {
      case 'describing':   renderDescribing(el, state);   break;
      case 'ordering':     renderOrdering(el, state);     break;
      case 'round-result': renderRoundResult(el, state);  break;
      case 'finished':     renderFinished(el, state);     break;
      default: el.innerHTML = '';
    }
  }

  // ── Phase: describing ─────────────────────────────────────────────────────────
  function renderDescribing(el, state) {
    if (state.iAmDescribed) {
      // Already submitted — show waiting screen with others' descriptions as they come in
      const waitingFor = state.players.filter(p => !p.hasDescribed).map(p => esc(p.playerName));

      el.innerHTML = `
        <div class="ito-section">
          <div class="ito-ok-badge">✅ Você já enviou sua(s) descrição(ões)!</div>
          ${waitingFor.length > 0
            ? `<p class="ito-muted">Aguardando: <strong>${waitingFor.join(', ')}</strong></p>`
            : `<p class="ito-muted">Todos enviaram! Entrando na fase de ordenação...</p>`
          }
        </div>
        <div class="ito-section">
          <div class="ito-section-title">Descrições enviadas até agora</div>
          ${renderSubmittedDescriptions(state)}
        </div>
      `;
      return;
    }

    // Build inputs for each card
    const inputs = state.myHand.map(card => `
      <div class="ito-card-input">
        <div class="ito-my-card">
          <span class="ito-card-number">${card.value}</span>
          <span class="ito-card-hint">de 1 a 100</span>
        </div>
        <input
          type="text"
          id="itoDesc${card.idx}"
          class="ito-desc-input"
          placeholder="Uma palavra ou frase curta..."
          maxlength="80"
          autocomplete="off"
          value="${esc(card.description || '')}"
        />
      </div>
    `).join('');

    el.innerHTML = `
      <div class="ito-section">
        <div class="ito-section-title">Suas cartas — descreva cada uma com uma palavra ou frase</div>
        <p class="ito-rule-hint">⚠️ Não use números, faixas ("mais ou menos 70") ou comparações diretas!</p>
        ${inputs}
        <button class="btn" onclick="window._itoSubmitDescriptions()" style="margin-top:0.75rem">
          Enviar descrições
        </button>
        <div id="itoDescError" class="ito-error" style="display:none"></div>
      </div>
      ${renderSubmittedDescriptions(state)}
    `;

    // Focus first empty input
    const firstEmpty = state.myHand.find(c => !c.description);
    if (firstEmpty !== undefined) {
      setTimeout(() => document.getElementById(`itoDesc${firstEmpty.idx}`)?.focus(), 50);
    }

    window._itoSubmitDescriptions = () => {
      const descriptions = state.myHand.map(card => {
        const input = document.getElementById(`itoDesc${card.idx}`);
        return { cardIdx: card.idx, text: input ? input.value.trim() : '' };
      });
      const empty = descriptions.find(d => !d.text);
      if (empty) {
        showDescError('Preencha todas as descrições antes de enviar.');
        return;
      }
      _sendAction({ type: 'describe', descriptions });
    };

    // Allow Enter on last input to submit
    const lastIdx = state.myHand.length - 1;
    const lastInput = document.getElementById(`itoDesc${lastIdx}`);
    if (lastInput) {
      lastInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') window._itoSubmitDescriptions();
      });
    }
  }

  function renderSubmittedDescriptions(state) {
    // Show descriptions already submitted by others
    const submitted = state.players
      .filter(p => p.hasDescribed && p.playerId !== _myPlayerId);
    if (submitted.length === 0) return '';

    return `
      <div class="ito-section">
        <div class="ito-section-title">Descrições já enviadas</div>
        <div class="ito-desc-list">
          ${submitted.map(p => {
            // Find their cards from myHand... we can't see others' card values,
            // but descriptions become visible once submitted
            return `<div class="ito-desc-entry">
              <span class="ito-desc-player">${esc(p.playerName)}</span>
              <span class="ito-desc-text ito-muted">(descrição oculta até a fase de ordenação)</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function showDescError(msg) {
    const el = document.getElementById('itoDescError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  // ── Phase: ordering ───────────────────────────────────────────────────────────
  function renderOrdering(el, state) {
    const cards = state.allCards;

    const cardRows = cards.map((c, i) => `
      <div class="ito-order-row" id="itoRow${i}">
        <div class="ito-order-pos">${i + 1}</div>
        <div class="ito-order-desc ${c.isMyCard ? 'my-desc' : ''}">
          <span class="ito-desc-word">${esc(c.description || '—')}</span>
          <span class="ito-desc-owner">${esc(c.playerName)}</span>
        </div>
        <div class="ito-order-btns">
          <button class="ito-move-btn" onclick="window._itoMove(${i}, -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="ito-move-btn" onclick="window._itoMove(${i}, +1)" ${i === cards.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="ito-section">
        <div class="ito-section-title">Ordenem da menor para a maior (sem revelar números!)</div>
        <p class="ito-rule-hint">Use ▲▼ para reposicionar. Qualquer jogador pode reordenar. Discutam antes de confirmar!</p>
        <div class="ito-order-list">${cardRows}</div>
        <button class="btn ito-confirm-btn" onclick="window._itoConfirmOrder()" style="margin-top:1rem">
          Confirmar Ordem e Revelar
        </button>
      </div>
    `;

    window._itoMove = (idx, dir) => {
      const newOrder = _lastState.allCards.map(c => ({ playerId: c.playerId, cardIdx: c.cardIdx }));
      const swapIdx  = idx + dir;
      if (swapIdx < 0 || swapIdx >= newOrder.length) return;
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      _sendAction({ type: 'reorder', order: newOrder });
    };

    window._itoConfirmOrder = () => {
      _sendAction({ type: 'confirm-order' });
    };
  }

  // ── Phase: round-result ───────────────────────────────────────────────────────
  function renderRoundResult(el, state) {
    const success = state.roundSuccess;
    const cards   = state.allCards;

    const cardRows = cards.map((c, i) => `
      <div class="ito-result-row ${c.correct ? 'correct' : 'wrong'}">
        <span class="ito-res-pos">${i + 1}</span>
        <span class="ito-res-value">${c.value}</span>
        <span class="ito-res-desc">${esc(c.description || '—')}</span>
        <span class="ito-res-player">${esc(c.playerName)}</span>
        <span class="ito-res-icon">${c.correct ? '✓' : '✗'}</span>
      </div>
    `).join('');

    const livesLeft = '♥'.repeat(state.lives) + '♡'.repeat(state.maxLives - state.lives);

    el.innerHTML = `
      <div class="ito-section">
        <div class="ito-result-banner ${success ? 'win' : 'lose'}">
          ${success ? '🎉 Rodada vencida!' : '💔 Rodada perdida!'}
          <span class="ito-lives-inline">${livesLeft}</span>
        </div>
        <div class="ito-result-list">${cardRows}</div>
        <button class="btn" onclick="window._itoNextRound()" style="margin-top:1rem">
          ${state.round >= state.maxRounds && success ? 'Fim de Jogo' : 'Próxima Rodada'}
        </button>
      </div>
    `;

    window._itoNextRound = () => _sendAction({ type: 'next-round' });
  }

  // ── Phase: finished ───────────────────────────────────────────────────────────
  function renderFinished(el, state) {
    el.innerHTML = `
      <div class="ito-section" style="text-align:center;padding:2rem">
        <div style="font-size:3rem;margin-bottom:1rem">${state.teamWon ? '🏆' : '💔'}</div>
        <div style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem">
          ${state.teamWon ? 'Parabéns, time!' : 'Sem mais vidas...'}
        </div>
      </div>
    `;
  }

  // ── Log ───────────────────────────────────────────────────────────────────────
  function renderLog(state) {
    const el = document.getElementById('itoLog');
    if (!el || !state.log?.length) return;
    el.innerHTML = `
      <div class="ito-log-title">Log da Partida</div>
      ${[...state.log].reverse().map(e =>
        `<div class="ito-log-entry">${esc(e.message)}</div>`
      ).join('')}
    `;
  }

  // ── Error handler ─────────────────────────────────────────────────────────────
  function onError(message) {
    showDescError(message);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render, onError };
})();
