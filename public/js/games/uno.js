(function () {
  'use strict';

  // ── Module state ────────────────────────────────────────────────────────────
  let _el, _myPlayerId, _isHost, _sendAction;
  let _state = null;
  let CARD_W = 80, CARD_H = 120;
  let _cardEls        = new Map();   // cardIndex → DOM el (hand cards)
  let _discardStack   = [];          // client-side stacking history
  let _prevTopCardKey = null;        // JSON key of last seen topCard
  let _discardPileRect = null;       // rect do monte de jogadas, capturado no render
  let _handPanX        = 0;          // deslocamento horizontal do leque (pan)
  let _maxHandPan      = 0;          // limite máximo de pan em cada direção
  let _fanEl           = null;       // wrapper do leque (recebe translateX)
  let _panOriginPanX   = 0;          // valor de _handPanX no início do gesto de pan

  // ── Card helpers ─────────────────────────────────────────────────────────────

  const VALUE_LABELS = {
    skip: '⊘', reverse: '↺', 'draw-two': '+2',
    wild: '', 'wild-draw-four': '+4',
  };

  function cardLabel(card) {
    return card.value in VALUE_LABELS ? VALUE_LABELS[card.value] : card.value;
  }

  // ── DOM builders ─────────────────────────────────────────────────────────────

  function buildCardEl(card, extraClass) {
    const label   = cardLabel(card);
    const isSmall = ['skip','reverse','draw-two','wild','wild-draw-four'].includes(card.value);
    const div = document.createElement('div');
    div.className = 'uno-card' + (extraClass ? ' ' + extraClass : '');
    div.dataset.color = card.color;
    div.dataset.value = card.value;
    div.innerHTML = `
      <div class="inner">
        <div class="uno-card-bg"></div>
        <div class="uno-card-color-overlay"></div>
        <div class="uno-card-value${isSmall ? ' small-icon' : ''}">${label}</div>
      </div>`;
    return div;
  }

  function buildCardBackEl(extraClass) {
    const div = document.createElement('div');
    div.className = 'uno-card' + (extraClass ? ' ' + extraClass : '');
    div.innerHTML = `<div class="inner"><img class="uno-card-back-img" src="/assets/uno/Verso carta.png" alt=""></div>`;
    return div;
  }

  // ── Size ─────────────────────────────────────────────────────────────────────

  function computeCardSize() {
    const fundo = _el && _el.querySelector('.uno-fundo');
    const w = fundo ? fundo.clientWidth  : window.innerWidth;
    const h = fundo ? fundo.clientHeight : window.innerHeight;
    const portrait = h >= w;
    const base = portrait ? w * 0.22 : Math.min(w * 0.09, h * 0.19);
    CARD_W = Math.max(52, Math.min(Math.round(base), 100));
    CARD_H = Math.round(CARD_W * 1.5);
  }

  // ── init ─────────────────────────────────────────────────────────────────────

  function init(el, myPlayerId, myPlayerName, isHost) {
    _el          = el;
    _myPlayerId  = myPlayerId;
    _isHost      = isHost;
    _cardEls.clear();
    _discardStack    = [];
    _prevTopCardKey  = null;
    _discardPileRect = null;

    _el.innerHTML = `
      <div class="uno-root">
        <button class="uno-btn-back">
          <img src="/assets/uno/Voltar.png" alt="Voltar">
        </button>
        <button class="uno-btn-reset">
          <img src="/assets/uno/Reiniciar (1).png" alt="Reiniciar">
        </button>
        <div class="uno-fundo">
          <div class="uno-opponents" id="unoOpponents"></div>
          <div class="uno-table-area" id="unoTablePiles"></div>
          <div class="uno-hand-area"  id="unoHandArea"></div>
        </div>
      </div>`;

    _el.querySelector('.uno-btn-back').addEventListener('click', () => {
      if (_sendAction) _sendAction({ type: 'leave' });
    });
    _el.querySelector('.uno-btn-reset').addEventListener('click', () => {
      if (_sendAction) _sendAction({ type: 'reset' });
    });

    computeCardSize();
    window.addEventListener('resize', _onResize);
  }

  function _onResize() {
    computeCardSize();
    if (_state) render(_state, _sendAction);
  }

  // ── Drag system ───────────────────────────────────────────────────────────────

  function isOverDiscardPile(clientX, clientY) {
    const piles = _el.querySelector('#unoTablePiles');
    if (!piles) return false;
    const r   = piles.getBoundingClientRect();
    const pad = 44;
    return clientX >= r.left - pad && clientX <= r.right  + pad &&
           clientY >= r.top  - pad && clientY <= r.bottom + pad;
  }

  function fundobounds() {
    const fundo = _el.querySelector('.uno-fundo');
    return fundo ? fundo.getBoundingClientRect() : { left: 0, top: 0 };
  }

  function attachDrag(el, card, cardIndex, tx, ty, rot) {
    let grabX = 0, grabY = 0, willPlay = false;
    let gestureMode   = null; // null | 'pan' | 'drag'
    let gestureStartX = 0, gestureStartY = 0;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      gestureMode   = null;
      gestureStartX = e.clientX;
      gestureStartY = e.clientY;
      willPlay      = false;
    });

    el.addEventListener('pointermove', (e) => {
      const dx = e.clientX - gestureStartX;
      const dy = e.clientY - gestureStartY;

      if (gestureMode === null) {
        if (Math.hypot(dx, dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.4) {
          gestureMode    = 'pan';
          _panOriginPanX = _handPanX;
        } else {
          gestureMode = 'drag';
          el.classList.add('dragging');
          const fr = fundobounds();
          grabX = gestureStartX - fr.left - (tx + _handPanX + CARD_W / 2);
          grabY = gestureStartY - fr.top  - (ty + CARD_H / 2);
        }
      }

      if (gestureMode === 'pan') {
        const newPan = Math.max(-_maxHandPan, Math.min(_maxHandPan, _panOriginPanX + dx));
        if (_fanEl) {
          _fanEl.style.transition = 'none';
          _fanEl.style.transform  = `translateX(${newPan}px)`;
        }
      } else if (gestureMode === 'drag') {
        const fr = fundobounds();
        const cx = (e.clientX - fr.left) - grabX - CARD_W / 2 - _handPanX;
        const cy = (e.clientY - fr.top)  - grabY - CARD_H / 2;
        el.style.transform = `translate(${cx}px, ${cy}px) rotate(0deg)`;
        const over = isOverDiscardPile(e.clientX, e.clientY);
        willPlay = over;
        el.classList.toggle('over-zone', over);
        const piles = _el.querySelector('#unoTablePiles');
        if (piles) piles.classList.toggle('zone-hot', over);
      }
    });

    const onEnd = (e) => {
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}

      if (gestureMode === 'pan') {
        const dx  = e.clientX - gestureStartX;
        _handPanX = Math.max(-_maxHandPan, Math.min(_maxHandPan, _panOriginPanX + dx));
        if (_fanEl) {
          _fanEl.style.transition = 'transform .3s cubic-bezier(.22,.9,.3,1)';
          _fanEl.style.transform  = `translateX(${_handPanX}px)`;
        }
      } else if (gestureMode === 'drag') {
        el.classList.remove('dragging', 'over-zone');
        const piles = _el.querySelector('#unoTablePiles');
        if (piles) piles.classList.remove('zone-hot');
        if (willPlay) {
          willPlay = false;
          _flyCardToDiscard(el.getBoundingClientRect(), card);
          _sendAction({ type: 'play-card', cardIndex });
        } else {
          willPlay = false;
          el.style.transition = 'transform .4s cubic-bezier(.22,.9,.3,1)';
          el.style.transform  = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
        }
      }
      gestureMode = null;
    };

    el.addEventListener('pointerup',     onEnd);
    el.addEventListener('pointercancel', onEnd);
  }

  // ── Animations ────────────────────────────────────────────────────────────────

  function _flyGhost(fromRect, toRect) {
    const ghost = buildCardBackEl();
    ghost.style.cssText = `
      position:fixed;
      left:${fromRect.left}px; top:${fromRect.top}px;
      width:${CARD_W}px; height:${CARD_H}px;
      pointer-events:none; z-index:9999;
      transition:transform .38s cubic-bezier(.22,.9,.3,1), opacity .38s ease;
    `;
    document.body.appendChild(ghost);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ghost.style.transform = `translate(${toRect.left - fromRect.left}px,${toRect.top - fromRect.top}px) scale(.7)`;
      ghost.style.opacity   = '0';
    }));
    setTimeout(() => ghost.remove(), 420);
  }

  function animateDrawCard() {
    const drawEl = _el.querySelector('.uno-draw-pile');
    const handEl = _el.querySelector('#unoHandArea');
    if (drawEl && handEl) _flyGhost(drawEl.getBoundingClientRect(), handEl.getBoundingClientRect());
  }

  function _findBadge(playerId) {
    return _el.querySelector(`.uno-opponent-badge[data-player-id="${playerId}"]`);
  }

  function animateOpponentPlay(playerId) {
    const badge = _findBadge(playerId);
    const piles = _el.querySelector('#unoTablePiles');
    if (!piles) return;
    const from = badge
      ? badge.getBoundingClientRect()
      : _el.querySelector('#unoOpponents').getBoundingClientRect();
    const card = _state && _state.topCard;
    if (card) _flyCardToDiscard(from, card);
    else _flyGhost(from, piles.getBoundingClientRect());
  }

  function _flyCardToDiscard(fromRect, card) {
    const to  = _discardPileRect;
    if (!to) return;

    const ghost = buildCardEl(card);
    const rot   = (Math.random() * 16 - 8).toFixed(1);
    ghost.style.cssText = `
      position:fixed;
      left:${fromRect.left}px; top:${fromRect.top}px;
      width:${CARD_W}px; height:${CARD_H}px;
      pointer-events:none; z-index:9999;
      transition:transform .35s cubic-bezier(.22,.9,.3,1);
    `;
    document.body.appendChild(ghost);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ghost.style.transform = `translate(${to.left - fromRect.left}px,${to.top - fromRect.top}px) rotate(${rot}deg)`;
    }));
    setTimeout(() => {
      ghost.style.transition = 'opacity .1s ease';
      ghost.style.opacity    = '0';
      setTimeout(() => ghost.remove(), 110);
    }, 360);
  }

  function animateOpponentDraw(playerId) {
    const drawEl = _el.querySelector('.uno-draw-pile');
    if (!drawEl) return;
    const badge = _findBadge(playerId);
    const to = badge ? badge.getBoundingClientRect() : _el.querySelector('#unoOpponents').getBoundingClientRect();
    _flyGhost(drawEl.getBoundingClientRect(), to);
  }

  // ── render ────────────────────────────────────────────────────────────────────

  function render(state, sendAction) {
    _sendAction = sendAction;
    _state      = state;

    const resetBtn = _el.querySelector('.uno-btn-reset');
    if (resetBtn) resetBtn.style.display = state.hostPlayerId === _myPlayerId ? '' : 'none';

    computeCardSize();
    renderOpponents(state);
    renderTablePiles(state);
    renderHand(state);
  }

  // ── Opponents ─────────────────────────────────────────────────────────────────

  function renderOpponents(state) {
    const container = _el.querySelector('#unoOpponents');
    if (!container) return;
    container.innerHTML = '';

    const opponents = state.players.filter(p => p.playerId !== _myPlayerId);
    if (!opponents.length) return;

    const fundo = _el.querySelector('.uno-fundo');
    const W  = (fundo ? fundo.offsetWidth  : _el.offsetWidth)  || 390;
    const cx = W / 2;
    const cy = 130;
    const rx = Math.min(W * 0.36, 140);
    const ry = 80;
    const angles = getArcAngles(opponents.length);

    opponents.forEach((opp, i) => {
      const rad = (angles[i] * Math.PI) / 180;
      const x   = cx + rx * Math.sin(rad);
      const y   = cy - ry * Math.cos(rad);

      const badge = document.createElement('div');
      badge.className        = 'uno-opponent-badge';
      badge.dataset.playerId = opp.playerId;
      badge.style.left       = x + 'px';
      badge.style.top        = y + 'px';
      badge.innerHTML = `
        <div class="uno-badge-wrap">
          <img class="uno-badge-bg" src="/assets/uno/IconesJogadoresAdversarios.png" alt="">
          <span class="uno-badge-name">${opp.playerName}</span>
          <span class="uno-badge-count">${opp.cardCount}</span>
        </div>`;
      container.appendChild(badge);
    });
  }

  function getArcAngles(n) {
    if (n === 1) return [0];
    const spread = Math.min(n * 28, 120);
    const step   = spread / (n - 1);
    return Array.from({ length: n }, (_, i) => -spread / 2 + i * step);
  }

  // ── Table piles ───────────────────────────────────────────────────────────────

  function renderTablePiles(state) {
    const container = _el.querySelector('#unoTablePiles');
    if (!container) return;
    container.innerHTML = '';

    // Accumulate discard stack client-side
    const topKey = state.topCard ? JSON.stringify(state.topCard) : null;
    if (state.topCard && topKey !== _prevTopCardKey) {
      _discardStack.push({
        ...state.topCard,
        rot: Math.random() * 24 - 12,
        dx:  Math.random() * 28 - 14,
        dy:  Math.random() * 16 - 8,
      });
      _prevTopCardKey = topKey;
    }

    // Draw pile
    const drawWrap = document.createElement('div');
    drawWrap.style.cssText = `position:relative; width:${CARD_W}px; height:${CARD_H}px; flex-shrink:0;`;
    const drawCard = buildCardBackEl('uno-draw-pile');
    drawCard.style.cssText = `
      position:absolute; inset:0;
      width:${CARD_W}px; height:${CARD_H}px;
    `;
    drawCard.addEventListener('click', () => {
      animateDrawCard();
      _sendAction({ type: 'draw-card' });
    });
    drawWrap.appendChild(drawCard);
    container.appendChild(drawWrap);

    // Discard pile (stacked, last 5 cards)
    if (_discardStack.length > 0) {
      const discardWrap = document.createElement('div');
      discardWrap.className = 'uno-discard-wrap';
      discardWrap.style.cssText = `position:relative; width:${CARD_W}px; height:${CARD_H}px; flex-shrink:0;`;

      _discardStack.slice(-5).forEach((c, i) => {
        const el = buildCardEl(c);
        el.style.cssText = `
          position:absolute; inset:0;
          width:${CARD_W}px; height:${CARD_H}px;
          z-index:${i};
          transform: translate(${c.dx}px, ${c.dy}px) rotate(${c.rot}deg);
          transition: transform .4s cubic-bezier(.22,.9,.3,1);
        `;
        discardWrap.appendChild(el);
      });

      container.appendChild(discardWrap);
      _discardPileRect = discardWrap.getBoundingClientRect();
    }
  }

  // ── Hand ──────────────────────────────────────────────────────────────────────

  function renderHand(state) {
    const handArea = _el.querySelector('#unoHandArea');
    if (!handArea) return;
    handArea.innerHTML = '';
    _cardEls.clear();

    const me = state.players.find(p => p.playerId === _myPlayerId);
    if (!me || !me.hand || me.hand.length === 0) return;

    const cards = me.hand;
    const n  = cards.length;
    const fw = handArea.clientWidth || 390;

    const naturalSpread = n > 1 ? n * CARD_W * 0.58 : 0;
    const overflow      = Math.max(0, naturalSpread + CARD_W - fw * 0.92);
    _maxHandPan         = overflow / 2;
    _handPanX           = Math.max(-_maxHandPan, Math.min(_maxHandPan, _handPanX));
    const spread = naturalSpread;
    const step   = n > 1 ? spread / (n - 1) : 0;
    const startX = fw / 2 - spread / 2; // pan aplicado no wrapper _fanEl, não aqui
    const totalAngle = Math.min(n * 3, 32);
    const arcDepth   = Math.min(n * 2, 40);
    // Cards sit at the bottom of handArea; ty is the vertical offset from top of handArea
    const baseY = (handArea.clientHeight || 220) - CARD_H - 8;

    _fanEl = document.createElement('div');
    _fanEl.style.cssText = `position:absolute;inset:0;transform:translateX(${_handPanX}px);transition:transform .3s cubic-bezier(.22,.9,.3,1);`;
    handArea.appendChild(_fanEl);

    cards.forEach((card, i) => {
      const t   = n > 1 ? i / (n - 1) - 0.5 : 0;
      const rot = t * totalAngle;
      const tx  = (n > 1 ? startX + i * step : fw / 2) - CARD_W / 2;
      const ty  = baseY + arcDepth * Math.pow(t * 2, 2);

      const el = buildCardEl(card);
      el.style.cssText = `
        position:absolute;
        left:0; top:0;
        width:${CARD_W}px; height:${CARD_H}px;
        z-index:${100 + i};
        --rot:${rot};
        transform:translate(${tx}px,${ty}px) rotate(${rot}deg);
        transform-origin:50% 100%;
        transition:transform .42s cubic-bezier(.22,.9,.3,1);
        touch-action:none;
      `;
      _fanEl.appendChild(el);
      _cardEls.set(i, el);
      attachDrag(el, card, i, tx, ty, rot);
    });
  }

  // ── onAnimate ─────────────────────────────────────────────────────────────────

  function onAnimate(data) {
    const { type, playerId } = data;
    if (type === 'play-card') {
      if (playerId !== _myPlayerId) animateOpponentPlay(playerId);
    } else if (type === 'draw-card') {
      if (playerId !== _myPlayerId) animateOpponentDraw(playerId);
      // Local player draw is animated immediately on click, not via socket
    }
  }

  // ── onError ───────────────────────────────────────────────────────────────────

  function onError(message) {
    console.warn('[Uno] error:', message);
  }

  // ── onReset ───────────────────────────────────────────────────────────────────

  function onReset() {
    _discardStack    = [];
    _prevTopCardKey  = null;
    _discardPileRect = null;
    _cardEls.clear();
    _handPanX        = 0;
    _maxHandPan      = 0;
    _fanEl           = null;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  window.GameModule = { init, render, onError, onReset, onAnimate };
})();
