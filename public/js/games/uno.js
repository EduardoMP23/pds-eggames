(function () {
  'use strict';

  // ── Module state ────────────────────────────────────────────────────────────
  let _root, _handArea, _oppEl, _drawPile, _discardPile, _navL, _navR, _toastEl;
  let _myPlayerId, _isHost, _sendAction;
  let _state = null;

  let players = [];             // [{playerId, playerName, cardCount}]
  let hand    = [];             // [{id,color,value,el,tx,ty,rot,dragging}] — ordem local
  let cardW = 92, cardH = 138, pileW = 84, pileH = 126;
  let panX = 0, maxPan = 0;     // navegação da mão quando transborda
  let selectedCard = null;

  let _topKey            = null;  // id da última carta renderizada no descarte
  let _pendingDiscardId  = null;  // carta em voo para o descarte (não re-renderizar)
  let _discardSyncTimer  = null;  // fallback p/ sincronizar descarte sem animação
  let _prevCounts        = new Map(); // playerId → cardCount anterior (bump)

  const AVA_COLORS = ['#ff5a5f','#3fa1ff','#3ecf6e','#ffc833','#b07fff','#ff8e4f','#4fd2c2'];

  const VALUE_LABELS = {
    skip: '⊘', reverse: '↺', 'draw-two': '+2',
    wild: '★', 'wild-draw-four': '+4',
  };

  function cardLabel(card) {
    return card.value in VALUE_LABELS ? VALUE_LABELS[card.value] : card.value;
  }

  /* ---------- tamanhos responsivos ---------- */
  function computeSizes() {
    const w = _root.clientWidth  || window.innerWidth;
    const h = _root.clientHeight || window.innerHeight;
    const portrait = h >= w;
    cardW = portrait ? Math.min(Math.max(w * 0.17, 62), 92) : Math.min(Math.max(w * 0.07, 70), 104);
    cardH = cardW * 1.5;
    pileW = cardW * 0.92;
    pileH = pileW * 1.5;
    _root.style.setProperty('--cw', cardW + 'px');
    _root.style.setProperty('--ch', cardH + 'px');
    _root.style.setProperty('--pile-w', pileW + 'px');
    _root.style.setProperty('--pile-h', pileH + 'px');
  }

  /* ---------- construção de carta ---------- */
  function cardHTML(card) {
    const v = cardLabel(card);
    return `<div class="card ${card.color}">
      <div class="face">
        <span class="corner tl">${v}</span>
        <span class="big">${v}</span>
        <span class="corner br">${v}</span>
      </div></div>`;
  }
  function backHTML() {
    return `<div class="card back"><div class="face"><span class="logo">CARDS</span></div></div>`;
  }

  /* ---------- painéis ---------- */
  function avaColor(i) { return AVA_COLORS[i % AVA_COLORS.length]; }

  function renderPlayers() {
    _oppEl.innerHTML = '';
    players.filter(p => p.playerId !== _myPlayerId).forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'panel';
      d.dataset.pid = p.playerId;
      d.innerHTML = `
        <div class="ava" style="background:${avaColor(i)}">${(p.playerName || '?')[0].toUpperCase()}</div>
        <div class="info">
          <div class="nick">${p.playerName}</div>
          <div class="cards"><span class="mini"></span><span class="count">${p.cardCount}</span></div>
        </div>`;
      _oppEl.appendChild(d);
      const prev = _prevCounts.get(p.playerId);
      if (prev !== undefined && prev !== p.cardCount) {
        const c = d.querySelector('.count');
        c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
      }
      _prevCounts.set(p.playerId, p.cardCount);
    });
  }

  function panelOf(pid) {
    return pid === _myPlayerId ? null : _oppEl.querySelector(`[data-pid="${pid}"]`);
  }

  /* ---------- pilhas ---------- */
  function renderDraw() {
    const st = _drawPile.querySelector('.stack');
    st.innerHTML = '';
    for (let i = 2; i >= 0; i--) {
      const l = document.createElement('div');
      l.className = 'layer';
      l.style.transform = `translate(${i * 2.5}px,${-i * 2.5}px)`;
      l.innerHTML = backHTML();
      st.appendChild(l);
    }
  }

  function setDrawCount(n) {
    const el = _root.querySelector('#unoDrawCount');
    if (el) el.textContent = n;
  }

  function renderDiscard(card) {
    // mantém até 4 cartas antigas empilhadas com rotações
    const olds = [..._discardPile.querySelectorAll('.dcard')];
    while (olds.length > 3) { olds.shift().remove(); }
    if (!card) return;
    const d = document.createElement('div');
    d.className = 'dcard';
    d.style.position = 'absolute';
    d.style.inset = '0';
    d.style.transform = `rotate(${(Math.random() * 36 - 18).toFixed(1)}deg)`;
    d.innerHTML = cardHTML(card);
    _discardPile.appendChild(d);
    d.animate(
      [{ transform: d.style.transform + ' scale(1.25)', opacity: .6 },
       { transform: d.style.transform + ' scale(1)',    opacity: 1 }],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' }
    );
    _topKey = card.id || null;
  }

  /* ---------- helpers de posição ---------- */
  function rectIn(el) {
    const r = el.getBoundingClientRect(), a = _root.getBoundingClientRect();
    return {
      x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height,
      cx: r.left - a.left + r.width / 2, cy: r.top - a.top + r.height / 2,
    };
  }

  /* ---------- carta voadora (animações) ---------- */
  function flyCard({ html, from, to, scaleFrom = 1, scaleTo = 1, rot = 0, dur = 550, onEnd }) {
    const f = document.createElement('div');
    f.className = 'fly';
    f.innerHTML = html;
    f.style.width = pileW + 'px';
    f.style.transitionDuration = dur + 'ms';
    f.style.transform = `translate(${from.x}px,${from.y}px) rotate(0deg) scale(${scaleFrom})`;
    _root.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transform = `translate(${to.x}px,${to.y}px) rotate(${rot}deg) scale(${scaleTo})`;
    }));
    setTimeout(() => { f.remove(); onEnd && onEnd(); }, dur + 30);
  }

  /* =========================================================
     MÃO EM ARCO + NAVEGAÇÃO
     ========================================================= */
  function arcSlots(n) {
    const fw = _root.clientWidth, fh = _root.clientHeight;
    let step = cardW * 0.62;
    const natural = (n - 1) * step + cardW;
    const maxView = fw * 0.96;
    const minStep = Math.max(cardW * 0.36, 34);
    if (n > 1 && natural > maxView) {
      step = Math.max(minStep, (maxView - cardW) / (n - 1));
    }
    const spread = (n - 1) * step + cardW;
    maxPan = Math.max(0, (spread - maxView) / 2 + cardW * 0.2);
    panX = Math.max(-maxPan, Math.min(maxPan, panX));

    const startX = fw / 2 - spread / 2 + panX;
    const baseY = fh - cardH - 18;
    const arcDepth = Math.min(8 + n * 1.6, 40);
    const totalAng = Math.min(n * 3, 26);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? (i / (n - 1) - .5) : 0;
      const x = startX + i * (n > 1 ? step : 0);
      out.push({ x, cx: x + cardW / 2, y: baseY + arcDepth * Math.pow(t * 2, 2), rot: t * totalAng });
    }
    return out;
  }

  function placeHandCard(c, s) {
    c.tx = s.x; c.ty = s.y; c.rot = s.rot;
    c.el.style.transform = `translate(${s.x}px,${s.y}px) rotate(${s.rot}deg)`;
  }

  function layoutHand() {
    const n = hand.length;
    const slots = arcSlots(n);
    hand.forEach((c, i) => {
      c.el.style.zIndex = 300 + i;
      if (!c.dragging) placeHandCard(c, slots[i]);
    });
    updateNav();
  }

  function updateNav() {
    const over = maxPan > 2;
    _navL.classList.toggle('show', over);
    _navR.classList.toggle('show', over);
    _navL.classList.toggle('dim', panX >= maxPan - 2);
    _navR.classList.toggle('dim', panX <= -maxPan + 2);
  }

  /* ---------- interação: tocar/arrastar carta ---------- */
  function selectCard(card) {
    if (selectedCard && selectedCard !== card) deselectCard();
    selectedCard = card;
    card.el.classList.add('selected');
  }
  function deselectCard() {
    if (!selectedCard) return;
    selectedCard.el.classList.remove('selected');
    selectedCard = null;
  }

  function buildHandCard(card) {
    const el = document.createElement('div');
    el.className = 'hand-card';
    el.dataset.id = card.id;
    el.innerHTML = `<div class="wrap">${cardHTML(card)}</div><button class="playtag">Jogar ▲</button>`;
    _handArea.appendChild(el);
    card.el = el;
    el.querySelector('.playtag').addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      if (selectedCard === card) { deselectCard(); playFromHand(card); }
    });
    attachCardPointer(card);
    return el;
  }

  function attachCardPointer(card) {
    const el = card.el;
    let sx = 0, sy = 0, grabX = 0, grabY = 0, mode = null, startPan = 0;

    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const a = _root.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; mode = 'tap'; startPan = panX;
      grabX = (e.clientX - a.left) - (card.tx + cardW / 2);
      grabY = (e.clientY - a.top)  - (card.ty + cardH / 2);
    });

    el.addEventListener('pointermove', e => {
      if (!mode) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;

      if (mode === 'tap') {
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4 && maxPan > 2) { mode = 'pan'; deselectCard(); }
        else if (Math.hypot(dx, dy) > 14) { mode = 'drag'; deselectCard(); el.classList.add('dragging'); card.dragging = true; }
        else return;
      }
      if (mode === 'pan') {
        panX = Math.max(-maxPan, Math.min(maxPan, startPan + dx));
        layoutHand();
        return;
      }
      if (mode === 'drag') {
        const a = _root.getBoundingClientRect();
        const cx = (e.clientX - a.left) - grabX, cy = (e.clientY - a.top) - grabY;
        el.style.transform = `translate(${cx - cardW / 2}px,${cy - cardH / 2}px) rotate(0deg) scale(1.08)`;
        // alvo: mesa/descarte
        const felt = rectIn(_root.querySelector('#unoFelt'));
        const over = cx > felt.x && cx < felt.x + felt.w && cy > felt.y && cy < felt.y + felt.h;
        _discardPile.querySelector('.placeholder').style.borderColor =
          over ? 'rgba(255,200,51,.95)' : 'rgba(255,255,255,.3)';
        el.dataset.over = over ? '1' : '';
        // reordenar: abre espaço
        if (!over) {
          const slots = arcSlots(hand.length);
          let gi = hand.length - 1;
          for (let i = 0; i < slots.length; i++) { if ((e.clientX - a.left) < slots[i].cx) { gi = i; break; } }
          el.dataset.gap = gi;
          const others = hand.filter(c => c !== card); let oi = 0;
          for (let i = 0; i < hand.length; i++) { if (i === gi) continue; placeHandCard(others[oi++], slots[i]); }
        }
      }
    });

    const end = e => {
      if (!mode) return;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (mode === 'tap') {
        // 1º toque seleciona (levanta a carta); 2º toque na carta recolhe.
        // A jogada só acontece pelo botão "Jogar ▲" ou arrastando até a mesa.
        if (selectedCard === card) deselectCard();
        else selectCard(card);
      } else if (mode === 'drag') {
        card.dragging = false; el.classList.remove('dragging');
        _discardPile.querySelector('.placeholder').style.borderColor = 'rgba(255,255,255,.3)';
        if (el.dataset.over === '1') { playFromHand(card, true); }
        else {
          const gi = parseInt(el.dataset.gap ?? hand.indexOf(card), 10);
          const others = hand.filter(c => c !== card);
          others.splice(isNaN(gi) ? others.length : gi, 0, card);
          hand = others; layoutHand();
        }
        el.dataset.over = '';
      }
      mode = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ---------- jogar carta: anima mão → descarte ---------- */
  function playFromHand(card, fromDrag = false) {
    hand = hand.filter(c => c !== card);
    const fromX = card.tx, fromY = card.ty;
    card.el.remove();
    if (fromDrag) {
      // a carta já foi arrastada até a mesa: pousa direto no descarte
      renderDiscard(card);
    } else {
      // confirmação por toque: animação da posição da carta na mão → descarte
      _pendingDiscardId = card.id;
      const disc = rectIn(_discardPile);
      flyCard({
        html: cardHTML(card),
        from: { x: fromX, y: fromY - 52 },
        to:   { x: disc.x, y: disc.y },
        scaleFrom: 1, scaleTo: .92, rot: (Math.random() * 30 - 15), dur: 480,
        onEnd: () => { _pendingDiscardId = null; renderDiscard(card); },
      });
    }
    layoutHand();
    if (_sendAction) _sendAction({ type: 'play-card', cardId: card.id });
  }

  /* ---------- comprar: anima baralho → mão ---------- */
  function addCardToHand(card) {
    const draw = rectIn(_drawPile);
    buildHandCard(card);
    hand.push(card);
    // nasce sobre o baralho e voa pro leque
    card.el.style.transition = 'none';
    card.el.style.transform = `translate(${draw.x}px,${draw.y}px) rotate(0deg) scale(.92)`;
    card.el.querySelector('.wrap').animate(
      [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.el.style.transition = '';
      layoutHand();
    }));
  }

  /* ---------- animações dos oponentes ---------- */
  function opponentDraw(pid) {
    const p = panelOf(pid); if (!p) return;
    const draw = rectIn(_drawPile), t = rectIn(p);
    flyCard({
      html: backHTML(), from: { x: draw.x, y: draw.y },
      to: { x: t.cx - pileW * .3, y: t.cy - pileH * .3 }, scaleFrom: 1, scaleTo: .42, rot: 10, dur: 480,
    });
  }

  function opponentPlay(pid, card) {
    const p = panelOf(pid);
    const disc = rectIn(_discardPile);
    if (!p || !card) { if (card) renderDiscard(card); return; }
    if (_discardSyncTimer) { clearTimeout(_discardSyncTimer); _discardSyncTimer = null; }
    _pendingDiscardId = card.id;
    const t = rectIn(p);
    flyCard({
      html: cardHTML(card), from: { x: t.cx - pileW * .3, y: t.cy - pileH * .3 },
      to: { x: disc.x, y: disc.y }, scaleFrom: .42, scaleTo: 1, rot: (Math.random() * 30 - 15), dur: 520,
      onEnd: () => { _pendingDiscardId = null; renderDiscard(card); },
    });
  }

  /* ---------- toast ---------- */
  let toastT = null;
  function toast(msg) {
    _toastEl.textContent = msg;
    _toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => _toastEl.classList.remove('show'), 1800);
  }

  /* =========================================================
     RECONCILIAÇÃO DA MÃO (estado do servidor → DOM)
     ========================================================= */
  function syncHand(serverHand) {
    const serverIds = new Set(serverHand.map(c => c.id));
    const localIds  = new Set(hand.map(c => c.id));

    // remove cartas que saíram da mão (jogada já animada localmente)
    hand.filter(c => !serverIds.has(c.id)).forEach(c => { c.el && c.el.remove(); deselectCard(); });
    hand = hand.filter(c => serverIds.has(c.id));

    const news = serverHand.filter(c => !localIds.has(c.id));
    if (hand.length === 0 && news.length > 1) {
      // mão inicial / reconexão: monta sem animação
      hand = news.map(c => ({ ...c }));
      hand.forEach(buildHandCard);
      panX = 0;
      layoutHand();
    } else {
      // compras avulsas: voam do baralho para o leque
      news.forEach(c => addCardToHand({ ...c }));
      layoutHand();
    }
  }

  /* =========================================================
     GameModule
     ========================================================= */
  function init(el, myPlayerId, myPlayerName, isHost) {
    _myPlayerId = myPlayerId;
    _isHost     = isHost;
    players = [];
    hand = [];
    panX = 0; maxPan = 0;
    selectedCard = null;
    _topKey = null;
    _pendingDiscardId = null;
    _prevCounts = new Map();

    el.innerHTML = `
      <div class="uno-root">
        <div class="topbar">
          <button class="iconbtn" id="unoBtnBack" title="Voltar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <button class="iconbtn" id="unoBtnRestart" title="Reiniciar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          </button>
        </div>
        <div id="unoOpponents"></div>
        <div id="unoTable"><div id="unoFelt">
          <div class="pile" id="unoDrawPile" title="Comprar carta">
            <div class="stack"></div>
            <div class="label"><b id="unoDrawCount">0</b> no baralho</div>
          </div>
          <div class="pile" id="unoDiscardPile"><div class="placeholder"></div></div>
        </div></div>
        <div id="unoToast"></div>
        <div id="unoHandArea"></div>
        <button class="handnav" id="unoNavL">‹</button>
        <button class="handnav" id="unoNavR">›</button>
      </div>`;

    _root        = el.querySelector('.uno-root');
    _handArea    = _root.querySelector('#unoHandArea');
    _oppEl       = _root.querySelector('#unoOpponents');
    _drawPile    = _root.querySelector('#unoDrawPile');
    _discardPile = _root.querySelector('#unoDiscardPile');
    _navL        = _root.querySelector('#unoNavL');
    _navR        = _root.querySelector('#unoNavR');
    _toastEl     = _root.querySelector('#unoToast');

    window.holdToConfirm(_root.querySelector('#unoBtnBack'), () => {
      if (_sendAction) _sendAction({ type: 'leave' });
      // fallback: se o servidor não responder com game:left, navega mesmo assim
      setTimeout(() => { window.location.href = '/'; }, 1000);
    });
    window.holdToConfirm(_root.querySelector('#unoBtnRestart'), () => {
      if (_sendAction) _sendAction({ type: 'reset' });
    });

    _navL.addEventListener('click', () => { panX = Math.min(maxPan, panX + cardW * 2.4); layoutHand(); });
    _navR.addEventListener('click', () => { panX = Math.max(-maxPan, panX - cardW * 2.4); layoutHand(); });

    _drawPile.addEventListener('click', () => {
      if (_sendAction) _sendAction({ type: 'draw-card' });
    });

    // toque fora de qualquer carta cancela a seleção
    _root.addEventListener('pointerdown', e => {
      if (selectedCard && !e.target.closest('.hand-card')) deselectCard();
    });

    window.removeEventListener('resize', _onResize);
    window.addEventListener('resize', _onResize);
    window.addEventListener('orientationchange', () => setTimeout(_onResize, 200));

    computeSizes();
    renderDraw();
  }

  function _onResize() {
    if (!_root) return;
    computeSizes();
    layoutHand();
    renderDraw();
  }

  function render(state, sendAction) {
    _sendAction = sendAction;
    _state      = state;

    const resetBtn = _root.querySelector('#unoBtnRestart');
    if (resetBtn) resetBtn.style.display = state.hostPlayerId === _myPlayerId ? '' : 'none';

    computeSizes();

    players = state.players.map(p => ({ ...p }));
    renderPlayers();
    setDrawCount(state.deckCount);

    // descarte: sincroniza com fallback curto — se uma animação de jogada
    // chegar logo em seguida (game:animate), ela assume a renderização
    if (_discardSyncTimer) { clearTimeout(_discardSyncTimer); _discardSyncTimer = null; }
    const top = state.topCard;
    if (top && top.id !== _topKey && top.id !== _pendingDiscardId) {
      const expectedId = top.id;
      _discardSyncTimer = setTimeout(() => {
        _discardSyncTimer = null;
        if (expectedId !== _topKey && expectedId !== _pendingDiscardId) renderDiscard(top);
      }, 150);
    }

    const me = state.players.find(p => p.playerId === _myPlayerId);
    syncHand((me && me.hand) || []);
  }

  function onAnimate(data) {
    const { type, playerId, card } = data;
    if (playerId === _myPlayerId) return; // ações próprias já animadas localmente
    if (type === 'play-card') opponentPlay(playerId, card);
    else if (type === 'draw-card') opponentDraw(playerId);
  }

  function onError(message) {
    toast(message);
  }

  function onReset() {
    if (_discardSyncTimer) { clearTimeout(_discardSyncTimer); _discardSyncTimer = null; }
    hand.forEach(c => c.el && c.el.remove());
    hand = [];
    selectedCard = null;
    panX = 0; maxPan = 0;
    _topKey = null;
    _pendingDiscardId = null;
    _prevCounts = new Map();
    if (_discardPile) _discardPile.querySelectorAll('.dcard').forEach(d => d.remove());
    if (_handArea) _handArea.innerHTML = '';
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window.GameModule = { init, render, onError, onReset, onAnimate };
})();
