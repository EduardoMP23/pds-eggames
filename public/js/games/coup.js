(function () {
  // ── Constants ────────────────────────────────────────────────────────────────
  const ROLE_LABELS = {
    duke: 'Duque', assassin: 'Assassino', captain: 'Capitão',
    ambassador: 'Embaixador', contessa: 'Condessa', unknown: '?',
  };
  const ROLE_ICONS = {
    duke: '🟡', assassin: '🗡️', captain: '⚓', ambassador: '📜', contessa: '👸', unknown: '❓',
  };
  const ACTION_LABELS = {
    income: 'Renda', 'foreign-aid': 'Ajuda Externa', coup: 'Golpe de Estado',
    tax: 'Taxa (Duque)', assassinate: 'Assassinar (Assassino)',
    steal: 'Roubar (Capitão)', exchange: 'Trocar (Embaixador)',
  };

  // Roles that can block each action
  const BLOCK_ROLES = {
    'foreign-aid': ['duke'],
    assassinate: ['contessa'],
    steal: ['captain', 'ambassador'],
  };

  // ── Module state ─────────────────────────────────────────────────────────────
  let _el = null;
  let _myPlayerId = null;
  let _sendAction = null;
  let _pendingActionType = null; // waiting for target selection
  let _lastState = null;

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init(el, myPlayerId) {
    _el = el;
    _myPlayerId = myPlayerId;
    _el.innerHTML = `
      <div class="coup-layout">
        <div class="coup-players" id="coupPlayers"></div>
        <div class="coup-main">
          <div class="coup-status" id="coupStatus"></div>
          <div class="coup-actions" id="coupActions"></div>
          <div class="coup-log" id="coupLog"></div>
        </div>
      </div>
    `;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(state, sendAction) {
    _sendAction = sendAction;
    _lastState = state;

    renderPlayers(state);
    renderStatus(state);
    renderActions(state);
    renderLog(state);
  }

  function renderPlayers(state) {
    const el = document.getElementById('coupPlayers');
    if (!el) return;
    el.innerHTML = state.players.map(p => {
      const isMe = p.playerId === _myPlayerId;
      const isTurn = p.isCurrentTurn && state.phase === 'action';
      const eliminated = p.eliminated;

      const cards = p.influence.map(c => {
        const label = ROLE_LABELS[c.role] || c.role;
        const icon = ROLE_ICONS[c.role] || '?';
        return `<span class="coup-card ${c.revealed ? 'revealed' : ''} ${isMe && !c.revealed ? 'mine' : ''}">${icon} ${label}</span>`;
      }).join('');

      return `
        <div class="coup-player ${isMe ? 'me' : ''} ${isTurn ? 'active-turn' : ''} ${eliminated ? 'eliminated' : ''}">
          <div class="coup-player-header">
            <span class="coup-player-name">${esc(p.playerName)}${isMe ? ' (você)' : ''}</span>
            <span class="coup-coins">💰 ${p.coins}</span>
          </div>
          <div class="coup-cards">${cards}</div>
          ${eliminated ? '<div class="coup-elim-badge">Eliminado</div>' : ''}
        </div>
      `;
    }).join('');
  }

  function renderStatus(state) {
    const el = document.getElementById('coupStatus');
    if (!el) return;

    let html = '';

    if (state.pendingAction) {
      const a = state.pendingAction;
      const actionLabel = ACTION_LABELS[a.type] || a.type;
      html += `<div class="coup-event">
        <strong>${esc(a.actorName)}</strong> declarou: <em>${actionLabel}</em>`;
      if (a.targetName) html += ` → alvo: <strong>${esc(a.targetName)}</strong>`;
      if (a.claimedRole) html += ` (alegando ser ${ROLE_LABELS[a.claimedRole]})`;
      html += `</div>`;
    }

    if (state.pendingBlock) {
      const b = state.pendingBlock;
      html += `<div class="coup-event coup-block">
        <strong>${esc(b.blockerName)}</strong> bloqueou alegando ser <em>${ROLE_LABELS[b.claimedRole]}</em>
      </div>`;
    }

    if (state.phase === 'await-reactions' || state.phase === 'await-block-reactions') {
      if (state.awaitingFromNames?.length > 0) {
        html += `<div class="coup-waiting">Aguardando: ${state.awaitingFromNames.map(n => esc(n)).join(', ')}</div>`;
      }
    }

    if (state.phase === 'await-lose-influence' && state.mustLoseInfluence) {
      html += `<div class="coup-alert">Escolha uma carta para revelar!</div>`;
    }

    if (state.phase === 'await-exchange' && state.exchangeOptions) {
      html += `<div class="coup-alert">Escolha quais cartas manter.</div>`;
    }

    el.innerHTML = html;
  }

  function renderActions(state) {
    const el = document.getElementById('coupActions');
    if (!el) return;
    el.innerHTML = '';

    // ── Lose influence ────────────────────────────────────────────────────────
    if (state.mustLoseInfluence) {
      const me = state.players.find(p => p.playerId === _myPlayerId);
      if (!me) return;
      const unrevealed = me.influence
        .map((c, i) => ({ ...c, idx: i }))
        .filter(c => !c.revealed);

      el.innerHTML = `<div class="coup-section-label">Escolha qual carta revelar:</div>
        <div class="coup-card-picker">
          ${unrevealed.map(c => `
            <button class="coup-pick-card" onclick="window._coupPickCard(${c.idx})">
              ${ROLE_ICONS[c.role]} ${ROLE_LABELS[c.role]}
            </button>
          `).join('')}
        </div>`;

      window._coupPickCard = (cardIndex) => {
        _sendAction({ type: 'lose-influence', cardIndex });
      };
      return;
    }

    // ── Exchange card selection ───────────────────────────────────────────────
    if (state.exchangeOptions && state.phase === 'await-exchange') {
      const me = state.players.find(p => p.playerId === _myPlayerId);
      const keepCount = me ? me.influence.filter(c => !c.revealed).length : 2;
      const selected = new Set();

      const updateExchangeBtn = () => {
        const btn = document.getElementById('coupExchangeConfirm');
        if (btn) btn.disabled = selected.size !== keepCount;
      };

      el.innerHTML = `<div class="coup-section-label">Escolha ${keepCount} carta(s) para manter:</div>
        <div class="coup-card-picker" id="coupExchangePicker">
          ${state.exchangeOptions.map((role, i) => `
            <button class="coup-pick-card selectable" id="coupExOpt${i}" onclick="window._coupToggleExchange(${i})">
              ${ROLE_ICONS[role]} ${ROLE_LABELS[role]}
            </button>
          `).join('')}
        </div>
        <button id="coupExchangeConfirm" class="btn" style="margin-top:0.75rem" disabled onclick="window._coupConfirmExchange()">
          Confirmar troca
        </button>`;

      window._coupToggleExchange = (i) => {
        if (selected.has(i)) {
          selected.delete(i);
          document.getElementById(`coupExOpt${i}`)?.classList.remove('selected');
        } else if (selected.size < keepCount) {
          selected.add(i);
          document.getElementById(`coupExOpt${i}`)?.classList.add('selected');
        }
        updateExchangeBtn();
      };

      window._coupConfirmExchange = () => {
        _sendAction({ type: 'exchange-select', keep: [...selected] });
      };
      return;
    }

    // ── My turn: action phase ─────────────────────────────────────────────────
    if (state.myTurn) {
      const me = state.players.find(p => p.playerId === _myPlayerId);
      if (!me) return;
      const coins = me.coins;
      const mustCoup = coins >= 10;
      const others = state.players.filter(p => p.playerId !== _myPlayerId && !p.eliminated);

      if (_pendingActionType) {
        // Target selection
        el.innerHTML = `
          <div class="coup-section-label">Escolha o alvo para <em>${ACTION_LABELS[_pendingActionType]}</em>:</div>
          <div class="coup-targets">
            ${others.map(p => `
              <button class="coup-target-btn" onclick="window._coupSelectTarget('${p.playerId}')">
                ${esc(p.playerName)} (💰 ${p.coins})
              </button>
            `).join('')}
          </div>
          <button class="btn btn-secondary" style="margin-top:0.5rem;font-size:0.85rem" onclick="window._coupCancelTarget()">Cancelar</button>`;

        window._coupSelectTarget = (targetId) => {
          _sendAction({ type: _pendingActionType, targetId });
          _pendingActionType = null;
        };
        window._coupCancelTarget = () => {
          _pendingActionType = null;
          renderActions(_lastState);
        };
        return;
      }

      const actions = [];

      if (!mustCoup) {
        actions.push({ type: 'income',       label: 'Renda',               desc: '+1 moeda', needsTarget: false });
        actions.push({ type: 'foreign-aid',  label: 'Ajuda Externa',       desc: '+2 moedas (pode ser bloqueada)', needsTarget: false });
        actions.push({ type: 'tax',          label: 'Taxa',                desc: '+3 moedas (Duque)', needsTarget: false });
        if (coins >= 3)
          actions.push({ type: 'assassinate', label: 'Assassinar',         desc: '-3 moedas, alvo perde carta (Assassino)', needsTarget: true });
        actions.push({ type: 'steal',        label: 'Roubar',              desc: '+2 moedas do alvo (Capitão)', needsTarget: true });
        actions.push({ type: 'exchange',     label: 'Trocar Cartas',       desc: 'Troca até 2 cartas com o baralho (Embaixador)', needsTarget: false });
      }

      if (coins >= 7)
        actions.push({ type: 'coup',         label: 'Golpe de Estado',     desc: `-7 moedas, alvo perde carta${mustCoup ? ' (OBRIGATÓRIO)' : ''}`, needsTarget: true });

      el.innerHTML = `
        <div class="coup-section-label">Sua vez — escolha uma ação (💰 ${coins} moedas):</div>
        <div class="coup-action-grid">
          ${actions.map(a => `
            <button class="coup-action-btn ${a.type === 'coup' && mustCoup ? 'mandatory' : ''}"
              onclick="window._coupTakeAction('${a.type}', ${a.needsTarget})">
              <span class="ca-label">${a.label}</span>
              <span class="ca-desc">${a.desc}</span>
            </button>
          `).join('')}
        </div>`;

      window._coupTakeAction = (type, needsTarget) => {
        if (needsTarget) {
          _pendingActionType = type;
          renderActions(_lastState);
        } else {
          _sendAction({ type });
        }
      };
      return;
    }

    // ── Reaction phase ────────────────────────────────────────────────────────
    if (state.iAmAwaiting && state.phase === 'await-reactions') {
      const a = state.pendingAction;
      const canChallenge = !!a?.claimedRole;
      const blockRoles = BLOCK_ROLES[a?.type] || [];
      const me = state.players.find(p => p.playerId === _myPlayerId);
      const isTarget = a?.targetPlayerId === _myPlayerId;
      const canBlock = blockRoles.length > 0 &&
        (a?.type === 'foreign-aid' || isTarget);

      el.innerHTML = `
        <div class="coup-section-label">Como você reage?</div>
        <div class="coup-reaction-btns">
          <button class="btn btn-secondary" onclick="window._coupReact('pass')">Passar</button>
          ${canChallenge ? `<button class="btn coup-btn-challenge" onclick="window._coupReact('challenge')">Contestar</button>` : ''}
          ${canBlock ? blockRoles.map(role => `
            <button class="btn coup-btn-block" onclick="window._coupBlock('${role}')">
              Bloquear como ${ROLE_LABELS[role]}
            </button>`).join('') : ''}
        </div>`;

      window._coupReact = (type) => _sendAction({ type });
      window._coupBlock = (claimedRole) => _sendAction({ type: 'block', claimedRole });
      return;
    }

    if (state.iAmAwaiting && state.phase === 'await-block-reactions') {
      const b = state.pendingBlock;
      el.innerHTML = `
        <div class="coup-section-label">
          <strong>${esc(b?.blockerName)}</strong> alega ser <em>${ROLE_LABELS[b?.claimedRole]}</em> para bloquear. O que você faz?
        </div>
        <div class="coup-reaction-btns">
          <button class="btn btn-secondary" onclick="window._coupReact('pass')">Aceitar bloqueio</button>
          <button class="btn coup-btn-challenge" onclick="window._coupReact('challenge')">Contestar bloqueio</button>
        </div>`;

      window._coupReact = (type) => _sendAction({ type });
      return;
    }

    // Waiting for others
    if (!state.myTurn && !state.iAmAwaiting && !state.mustLoseInfluence) {
      el.innerHTML = `<div class="coup-waiting-msg">Aguardando outros jogadores...</div>`;
    }
  }

  function renderLog(state) {
    const el = document.getElementById('coupLog');
    if (!el || !state.log?.length) return;
    el.innerHTML = `
      <div class="coup-log-title">Histórico</div>
      ${[...state.log].reverse().map(e => `<div class="coup-log-entry">${esc(e.message)}</div>`).join('')}
    `;
  }

  // ── Error handler ─────────────────────────────────────────────────────────────
  function onError(message) {
    const el = document.getElementById('coupActions');
    if (!el) return;
    const errEl = document.createElement('div');
    errEl.className = 'coup-error';
    errEl.textContent = message;
    el.prepend(errEl);
    setTimeout(() => errEl.remove(), 3000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render, onError };
})();
