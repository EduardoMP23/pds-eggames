(function () {
  'use strict';

  let _el         = null;
  let _myId       = null;
  let _isHost     = false;
  let _sendAction = null;
  let _lastState  = null;
  let _countdown  = 0;
  let _countdownTimer = null;
  let _toastTimer     = null;

  // fallbacks when avatar/color are null
  const FALLBACK_AVATARS = ['knight','wizard','ninja','robot','alien','cat','ghost','skull'];
  const FALLBACK_COLORS  = ['#ff2e88','#00f0ff','#39ff7a','#ffe600','#ff7a1f','#b14aed','#ff3860','#5effc1'];

  function avatarOf(p, idx) {
    return {
      kind:  p.avatar || FALLBACK_AVATARS[idx % FALLBACK_AVATARS.length],
      color: p.color  || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    };
  }

  // ── Build DOM once ────────────────────────────────────────────────────────
  function buildDOM(container) {
    container.innerHTML = `
<div class="pa-layout">

  <div class="pa-header">
    <button class="pa-back-btn" id="paBackBtn">
      <img src="/assets/PiorDaMesa/Voltar .png" class="pa-btn-icon" alt="Voltar">
    </button>
    <button class="pa-reiniciar-btn pa-reiniciar-btn--hidden" id="paReiniciarBtn">
      <img src="/assets/PiorDaMesa/Reiniciar.png" class="pa-btn-icon" alt="Reiniciar">
    </button>
  </div>

  <div class="pa-players-strip" id="paPlayersStrip"></div>

  <div class="pa-card-area">

    <div class="pa-card-wrap" id="paCardWrap">
      <div class="pa-card" id="paCard">
        <div class="pa-card-face pa-card-back">
          <img src="/assets/PiorDaMesa/CartaAtrasComLogo.png" class="pa-card-img" alt="">
        </div>
        <div class="pa-card-face pa-card-front">
          <img src="/assets/PiorDaMesa/FrenteComTema.png" class="pa-card-img" alt="">
          <div class="pa-card-phrase" id="paCardPhrase"></div>
        </div>
      </div>
    </div>

  </div>

  <div class="pa-toast" id="paToast"></div>
</div>`;

    document.getElementById('paBackBtn').addEventListener('click', () => {
      _sendAction({ type: 'leave' });
    });

    document.getElementById('paReiniciarBtn').addEventListener('click', () => {
      _sendAction({ type: 'reset' });
    });

    // drag-down on card
    setupCardDrag();
  }

  // ── Drag-down mechanic ────────────────────────────────────────────────────
  function setupCardDrag() {
    const card = document.getElementById('paCard');
    if (!card) return;

    let startY    = 0;
    let currentDY = 0;
    let dragging  = false;
    let committed = false;

    const THRESHOLD = 80; // px needed to accept

    function canDrag() {
      if (!_lastState) return false;
      if (_lastState.phase !== 'accepting') return false;
      if (_lastState.acceptedBy) return false;
      if (_lastState.status !== 'playing') return false;
      return true;
    }

    // Preserves the flip transform when composing with translateY
    function applyDragTransform(dy) {
      const flipped = card.classList.contains('pa-card--flipped');
      card.style.transform = flipped
        ? `translateY(${dy}px) rotateY(180deg)`
        : `translateY(${dy}px)`;
    }

    card.addEventListener('pointerdown', e => {
      if (!canDrag()) return;
      e.preventDefault();
      card.setPointerCapture(e.pointerId);
      startY    = e.clientY;
      currentDY = 0;
      dragging  = true;
      committed = false;
      card.classList.add('pa-card--dragging');
    });

    card.addEventListener('pointermove', e => {
      if (!dragging) return;
      currentDY = Math.max(0, e.clientY - startY); // only downward
      applyDragTransform(currentDY);

      if (currentDY > THRESHOLD * 0.6) {
        card.classList.add('pa-card--near-threshold');
      } else {
        card.classList.remove('pa-card--near-threshold');
      }
    });

    card.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('pa-card--dragging');
      card.classList.remove('pa-card--near-threshold');

      if (currentDY >= THRESHOLD && !committed) {
        committed = true;
        const flipped = card.classList.contains('pa-card--flipped');
        card.classList.add('pa-card--fall');
        card.style.transform = flipped
          ? 'translateY(120%) rotateY(180deg)'
          : 'translateY(120%)';
        _sendAction({ type: 'accept-card' });
      } else {
        card.classList.add('pa-card--snap');
        card.style.transform = '';
        setTimeout(() => card.classList.remove('pa-card--snap'), 400);
      }
    });

    card.addEventListener('pointercancel', () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('pa-card--dragging', 'pa-card--near-threshold');
      card.classList.add('pa-card--snap');
      card.style.transform = '';
      setTimeout(() => card.classList.remove('pa-card--snap'), 400);
    });
  }

  // ── Countdown (internal only — not shown in UI) ───────────────────────────
  function startCountdown(seconds) {
    stopCountdown();
    _countdown = seconds;
    _countdownTimer = setInterval(() => {
      _countdown = Math.max(0, _countdown - 1);
      if (_countdown <= 0) stopCountdown();
    }, 1000);
  }

  function stopCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.getElementById('paToast');
    if (!t) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    t.textContent = msg;
    t.classList.add('pa-toast--visible');
    _toastTimer = setTimeout(() => t.classList.remove('pa-toast--visible'), 2500);
  }

  // ── Render players strip ──────────────────────────────────────────────────
  function renderPlayers(state) {
    const strip = document.getElementById('paPlayersStrip');
    if (!strip) return;

    strip.innerHTML = state.players.map((p, idx) => {
      const isReader = p.playerId === state.currentReaderId;
      const isMe     = p.playerId === _myId;
      const isAccept = p.playerId === state.acceptedBy;
      let cls = 'pa-player';
      if (isReader && state.phase === 'reading') cls += ' pa-player--reader';
      if (isAccept)  cls += ' pa-player--accepted';
      if (isMe)      cls += ' pa-player--me';

      return `<div class="${cls}" data-idx="${idx}">
        <div class="pa-avatar" id="paAv_${p.playerId}"></div>
        <div class="pa-player-name">${escapeHtml(p.playerName)}</div>
        <div class="pa-player-score">${p.score}</div>
      </div>`;
    }).join('');

    if (typeof renderSprite === 'function') {
      state.players.forEach((p, idx) => {
        const el = document.getElementById(`paAv_${p.playerId}`);
        if (!el) return;
        const av = avatarOf(p, idx);
        renderSprite(el, av.kind, av.color, 36);
      });
    }
  }

  // ── Render card area ──────────────────────────────────────────────────────
  function renderCard(state) {
    const card        = document.getElementById('paCard');
    const cardPhrase  = document.getElementById('paCardPhrase');
    const reiniciarBtn = document.getElementById('paReiniciarBtn');
    if (!card) return;

    const isReader = state.currentReaderId === _myId;

    // reset fall animation on each state update
    card.classList.remove('pa-card--fall');
    card.style.transform = '';

    // host controls
    if (reiniciarBtn) {
      reiniciarBtn.classList.toggle('pa-reiniciar-btn--hidden', !_isHost);
    }

    if (state.phase === 'reading') {
      if (isReader) {
        card.classList.add('pa-card--flipped');
        cardPhrase.textContent = state.currentCard || '';
      } else {
        card.classList.remove('pa-card--flipped');
      }
    } else if (state.phase === 'accepting') {
      stopCountdown();
      if (isReader) {
        card.classList.add('pa-card--flipped');
        cardPhrase.textContent = state.currentCard || '';
      } else {
        card.classList.remove('pa-card--flipped');
      }
    }
  }

  // ── Main render ──────────────────────────────────────────────────────────
  function render(state, sendAction) {
    _sendAction = sendAction;
    const prevPhase = _lastState?.phase;
    _lastState = state;
    if (!_el) return;

    // internal countdown (not shown) — keeps _countdown in sync for canDrag timing
    if (state.phase === 'reading' && state.currentReaderId !== _myId) {
      if (prevPhase !== 'reading') startCountdown(10);
    } else if (state.phase !== 'reading') {
      stopCountdown();
    }

    renderPlayers(state);
    renderCard(state);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Module interface ──────────────────────────────────────────────────────
  window.GameModule = {
    init(container, myPlayerId, myPlayerName, isHost) {
      _el     = container;
      _myId   = myPlayerId;
      _isHost = isHost;
      buildDOM(container);
    },

    render(state, sendAction) {
      render(state, sendAction);
    },

    onReset() {
      stopCountdown();
      _lastState = null;
      _countdown = 0;
    },

    onError(message) {
      showToast(message);
    },
  };
})();
