(function () {
  let container, myPlayerId, myPlayerName;
  let sendAction = null;
  let currentState = null;
  let pendingTargetAction = null;

  const ROLE_EMOJI = { duke: '🟣', assassin: '🗡️', ambassador: '🔵', captain: '⚓', contessa: '❤️' };
  const ROLE_NAME = { duke: 'Duke', assassin: 'Assassino', ambassador: 'Embaixador', captain: 'Capitão', contessa: 'Contessa' };

  const ACTION_META = {
    income:       { label: '💰 Renda (+1)', needsTarget: false },
    'foreign-aid':{ label: '🏦 Ajuda Ext. (+2)', needsTarget: false },
    coup:         { label: '💥 Golpe de Estado (7💰)', needsTarget: true },
    tax:          { label: '🟣 Taxa Duke (+3)', needsTarget: false },
    assassinate:  { label: '🗡️ Assassinar (3💰)', needsTarget: true },
    steal:        { label: '⚓ Roubar', needsTarget: true },
    exchange:     { label: '🔵 Troca Ambassador', needsTarget: false }
  };

  function init(el, playerId, playerName) {
    container = el;
    myPlayerId = playerId;
    myPlayerName = playerName;
  }

  function render(state, actionFn) {
    sendAction = actionFn;
    currentState = state;

    const me = state.players.find(p => p.playerId === myPlayerId);
    const currentPlayer = state.players[state.currentTurnIndex];
    const isMyTurn = state.isMyTurn;

    container.innerHTML = `<div class="coup-wrapper">
      <div class="coup-players-grid" id="coupPlayers"></div>
      <div class="coup-status" id="coupStatus"></div>
      <div class="coup-actions">
        <h3>Ações</h3>
        <div class="action-buttons" id="coupActions"></div>
      </div>
      ${renderExchangeModal(state)}
      ${renderRevealModal(state)}
    </div>`;

    // Players
    const playersEl = document.getElementById('coupPlayers');
    state.players.forEach(p => {
      const isMe = p.playerId === myPlayerId;
      const influences = isMe
        ? p.influence.map(role => `<span class="influence-badge ${role}">${ROLE_EMOJI[role]||''} ${ROLE_NAME[role]||role}</span>`)
        : Array(p.influenceCount).fill(`<span class="influence-badge unknown">?</span>`);
      const lost = p.lostInfluence.map(role => `<span class="influence-badge ${role} lost">${ROLE_EMOJI[role]||''} ${ROLE_NAME[role]||role}</span>`);

      const card = document.createElement('div');
      card.className = 'coup-player-card' +
        (p.playerId === currentPlayer?.playerId ? ' active-turn' : '') +
        (p.isEliminated ? ' eliminated' : '');
      card.innerHTML = `
        <div class="pname">${esc(p.playerName)}${isMe ? ' <small style="color:var(--muted)">(você)</small>' : ''}</div>
        <div class="coins">💰 ${p.coins}</div>
        <div class="influences">${[...influences, ...lost].join('')}</div>
      `;
      playersEl.appendChild(card);
    });

    // Status
    const statusEl = document.getElementById('coupStatus');
    statusEl.textContent = getStatusText(state);

    // Actions
    const actionsEl = document.getElementById('coupActions');
    renderActions(state, actionsEl, me);
  }

  function getStatusText(state) {
    const current = state.players[state.currentTurnIndex];
    if (state.phase === 'action') {
      return state.isMyTurn ? '🟢 Sua vez — escolha uma ação' : `⏳ Vez de ${current?.playerName}`;
    }
    if (state.phase === 'counter-action') {
      const pa = state.pendingAction;
      const actor = state.players.find(p => p.playerId === pa?.playerId);
      return `🔄 ${actor?.playerName} realizou "${pa?.type}". Você pode bloqueio ou desafio.`;
    }
    if (state.phase === 'challenge') {
      if (state.pendingCounter) {
        const blocker = state.players.find(p => p.playerId === state.pendingCounter?.blockerId);
        const actionOwner = state.players.find(p => p.playerId === state.pendingAction?.playerId);
        return `🤔 ${blocker?.playerName} bloqueia com ${state.pendingCounter.claimedRole}. ${actionOwner?.playerName}, você desafia?`;
      }
      if (state.pendingChallenge?.challengerId) {
        const challenger = state.players.find(p => p.playerId === state.pendingChallenge.challengerId);
        const challenged = state.players.find(p => p.playerId === state.pendingChallenge.challengedId);
        return `⚔️ ${challenger?.playerName} desafia ${challenged?.playerName}! ${challenged?.playerName}, revele.`;
      }
    }
    if (state.phase === 'reveal-influence') {
      const loser = state.players.find(p => p.playerId === state.pendingChallenge?.loserId);
      return `😱 ${loser?.playerName} deve revelar uma influência!`;
    }
    if (state.phase === 'exchange-select') {
      const actor = state.players.find(p => p.playerId === state.pendingAction?.playerId);
      return `🔵 ${actor?.playerName} está trocando influências`;
    }
    return '';
  }

  function renderActions(state, el, me) {
    if (!me || me.isEliminated) return;

    if (state.phase === 'action' && state.isMyTurn) {
      Object.entries(ACTION_META).forEach(([type, meta]) => {
        if (type === 'coup' && (me.coins < 7)) return;
        if (type !== 'coup' && me.coins >= 10) return; // must coup

        if (meta.needsTarget) {
          // Show for each valid target
          const targets = state.players.filter(p => !p.isEliminated && p.playerId !== myPlayerId);
          targets.forEach(target => {
            const btn = createBtn(`${meta.label} → ${esc(target.playerName)}`, 'action-btn', () => {
              sendAction({ type, targetPlayerId: target.playerId });
            });
            el.appendChild(btn);
          });
        } else {
          const btn = createBtn(meta.label, 'action-btn', () => sendAction({ type }));
          el.appendChild(btn);
        }
      });
      return;
    }

    if (state.phase === 'counter-action') {
      const pending = state.pendingAction;
      const isActionOwner = pending?.playerId === myPlayerId;
      if (!isActionOwner) {
        // Pass
        el.appendChild(createBtn('✅ Passar', 'action-btn pass-btn', () => sendAction({ type: 'pass' })));
        // Challenge (if there's a claimed role)
        if (pending?.claimedRole) {
          el.appendChild(createBtn(`⚔️ Desafiar (${pending.claimedRole})`, 'action-btn challenge-btn', () => sendAction({ type: 'challenge' })));
        }
        // Block options
        const blockMap = {
          'foreign-aid': [{ role: 'duke', label: '🟣 Bloquear (Duke)' }],
          'assassinate': pending?.targetPlayerId === myPlayerId ? [{ role: 'contessa', label: '❤️ Bloquear (Contessa)' }] : [],
          'steal': pending?.targetPlayerId === myPlayerId ? [
            { role: 'captain', label: '⚓ Bloquear (Capitão)' },
            { role: 'ambassador', label: '🔵 Bloquear (Embaixador)' }
          ] : []
        };
        const blocks = blockMap[pending?.type] || [];
        blocks.forEach(({ role, label }) => {
          el.appendChild(createBtn(label, 'action-btn block-btn', () => sendAction({ type: 'block', claimedRole: role })));
        });
      }
      return;
    }

    if (state.phase === 'challenge') {
      const actionOwner = state.pendingAction?.playerId === myPlayerId;
      const pendingCounter = state.pendingCounter;

      if (pendingCounter) {
        // Only action owner can challenge or pass the block
        if (actionOwner) {
          el.appendChild(createBtn('✅ Aceitar Bloqueio', 'action-btn pass-btn', () => sendAction({ type: 'pass' })));
          el.appendChild(createBtn(`⚔️ Desafiar Bloqueio (${pendingCounter.claimedRole})`, 'action-btn challenge-btn', () => sendAction({ type: 'challenge' })));
        }
        return;
      }

      // Reveal phase for challenge
      if (state.pendingChallenge?.challengedId === myPlayerId) {
        const myInfluence = currentState.myInfluence || [];
        myInfluence.forEach(role => {
          el.appendChild(createBtn(`Revelar ${ROLE_NAME[role]||role}`, 'action-btn', () => sendAction({ type: 'reveal' })));
        });
      }
      return;
    }

    if (state.phase === 'reveal-influence') {
      const loser = state.pendingChallenge?.loserId;
      if (loser === myPlayerId) {
        const myInfluence = currentState.myInfluence || [];
        if (myInfluence.length === 0) return;
        const label = document.createElement('p');
        label.textContent = 'Escolha a influência a perder:';
        label.style.cssText = 'width:100%;color:var(--muted);font-size:0.875rem';
        el.appendChild(label);
        myInfluence.forEach(role => {
          el.appendChild(createBtn(`Perder ${ROLE_NAME[role]||role}`, 'action-btn', () => sendAction({ type: 'reveal-card', card: role })));
        });
      }
    }
  }

  function renderExchangeModal(state) {
    if (state.phase !== 'exchange-select' || state.pendingAction?.playerId !== myPlayerId) return '';
    const drawn = state.pendingAction?.drawnCards || [];
    const myInfl = state.myInfluence || [];
    const combined = [...myInfl, ...drawn];

    return `<div class="modal-overlay" style="position:fixed">
      <div class="modal">
        <h2>🔵 Troca de Ambassador</h2>
        <p style="color:var(--muted);margin-bottom:1rem">Escolha ${myInfl.length} carta(s) para ficar:</p>
        <div class="influence-choices" id="exchangeChoices">
          ${combined.map((role, i) => `
            <div class="influence-badge ${role}" style="cursor:pointer;padding:0.5rem;border:2px solid transparent"
              data-role="${role}" data-idx="${i}" onclick="toggleExchangeCard(this)">
              ${ROLE_EMOJI[role]||''} ${ROLE_NAME[role]||role}
            </div>`).join('')}
        </div>
        <button class="btn" style="margin-top:1rem" onclick="confirmExchange()">Confirmar</button>
      </div>
    </div>`;
  }

  function renderRevealModal(state) { return ''; }

  window.toggleExchangeCard = function (el) {
    const selected = el.style.borderColor === 'rgb(233, 69, 96)';
    el.style.borderColor = selected ? 'transparent' : 'var(--accent)';
  };

  window.confirmExchange = function () {
    const choices = document.querySelectorAll('#exchangeChoices [data-role]');
    const keep = [];
    choices.forEach(el => {
      if (el.style.borderColor === 'rgb(233, 69, 96)' || el.style.borderColor.includes('233')) {
        keep.push(el.dataset.role);
      }
    });
    if (keep.length !== (currentState?.myInfluence?.length || 0)) {
      alert(`Selecione exatamente ${currentState?.myInfluence?.length} carta(s)`);
      return;
    }
    sendAction({ type: 'exchange-select', keep });
  };

  function createBtn(label, className, onClick) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.innerHTML = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render };
})();
