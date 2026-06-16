(function () {
  'use strict';

  let _el          = null;
  let _myId        = null;
  let _isHost      = false;
  let _sendAction  = null;
  let _lastState   = null;
  let _handEls     = {};       // cardId (string) → DOM element
  let _currentHand = [];       // ordered card array for local display
  let _cw          = 84;
  let _ch          = 117;
  let _toastTimer  = null;
  let _ro          = null;     // ResizeObserver: relayout quando o field ganha dimensões
  let _drawDrag    = null;     // arraste de compra (monte → mão) em andamento
  let _skipOwnDrawAnim = false; // pula a animação de voo da própria compra quando feita por arraste

  const FALLBACK_AVATARS = ['knight','wizard','ninja','robot','alien','cat','ghost','skull'];
  const FALLBACK_COLORS  = ['#ff2e88','#00f0ff','#39ff7a','#ffe600','#ff7a1f','#b14aed','#ff3860','#5effc1'];

  function avatarOf(p, idx) {
    return {
      kind:  p.avatar || FALLBACK_AVATARS[idx % FALLBACK_AVATARS.length],
      color: p.color  || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    };
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  function buildDOM(container) {
    container.innerHTML = `
<div class="pf-field" id="pfField">
  <button class="pf-topbtn pf-btn-back"  id="pfBackBtn">&#8592;</button>
  <button class="pf-topbtn pf-btn-reset pf-btn-reset--hidden" id="pfResetBtn">&#8635;</button>
  <div class="pf-avatars" id="pfAvatars"></div>
  <div class="pf-table">
    <div class="pf-felt" id="pfFelt">
      <div class="pf-slot" id="pfDiscardSlot" title="Comprar do descarte"></div>
      <div class="pf-slot" id="pfStockSlot"   title="Comprar do baralho"></div>
    </div>
  </div>
  <div id="pfTray"></div>
  <div class="pf-toast" id="pfToast"></div>
</div>`;

    window.holdToConfirm(document.getElementById('pfBackBtn'), () => {
      _sendAction({ type: 'leave' });
      // fallback: se o servidor não responder com game:left, navega mesmo assim
      setTimeout(() => { window.location.href = '/'; }, 1000);
    });
    window.holdToConfirm(document.getElementById('pfResetBtn'), () => {
      _sendAction({ type: 'reset' });
    });
    attachPileDraw(document.getElementById('pfStockSlot'),   'stock');
    attachPileDraw(document.getElementById('pfDiscardSlot'), 'discard');
  }

  // ── Comprar arrastando (monte → mão), escolhendo a posição ─────────────────
  // Tap = compra rápida (carta vai pro fim). Arraste = compra posicionada.
  function attachPileDraw(slotEl, source) {
    if (!slotEl) return;
    let sx = 0, sy = 0, pending = false, dragging = false;

    slotEl.addEventListener('pointerdown', e => {
      if (!_lastState) return;
      pending = true; dragging = false;
      sx = e.clientX; sy = e.clientY;
      try { slotEl.setPointerCapture(e.pointerId); } catch (_) {}
    });

    slotEl.addEventListener('pointermove', e => {
      if (dragging) { updateDrawDrag(e); return; }
      if (!pending) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
      if (_currentHand.length >= 10) { pending = false; showToast('Mão cheia — descarte antes de comprar'); return; }
      if (source === 'discard' && !_lastState.discardTop) { pending = false; showToast('Descarte vazio'); return; }
      pending = false; dragging = true;
      startDrawDrag(source, e);
      updateDrawDrag(e);
    });

    const end = e => {
      try { slotEl.releasePointerCapture(e.pointerId); } catch (_) {}
      if (dragging) {
        dragging = false;
        endDrawDrag();
      } else if (pending) {
        pending = false;
        if (_currentHand.length >= 10) { showToast('Mão cheia — descarte antes de comprar'); return; }
        if (source === 'stock') {
          _sendAction({ type: 'draw-stock' });
        } else {
          if (!_lastState.discardTop) { showToast('Descarte vazio'); return; }
          _sendAction({ type: 'draw-discard' });
        }
      }
    };
    slotEl.addEventListener('pointerup', end);
    slotEl.addEventListener('pointercancel', end);
  }

  function startDrawDrag(source, e) {
    const field = document.getElementById('pfField');
    if (!field) return;
    const el = document.createElement('div');
    el.className = 'pf-card pf-hand-card pf-dragging';
    let card = null, cardId = null;
    if (source === 'discard') {
      card   = _lastState.discardTop;
      cardId = String(card.id);
      el.innerHTML = cardFaceHTML(card);
    } else {
      el.innerHTML = '<div class="pf-inner"><div class="pf-back-face"></div></div>';
    }
    field.appendChild(el);
    _drawDrag = { source, cardId, card, el, gapIndex: _currentHand.length, released: false };
    _skipOwnDrawAnim = true;
    _sendAction({ type: source === 'discard' ? 'draw-discard' : 'draw-stock' });
  }

  function updateDrawDrag(e) {
    if (!_drawDrag) return;
    const field = document.getElementById('pfField');
    if (!field) return;
    const f  = field.getBoundingClientRect();
    const px = e.clientX - f.left, py = e.clientY - f.top;
    _drawDrag.el.style.transform = `translate(${px - _cw / 2}px,${py - _ch / 2}px) rotate(0deg) scale(1.07)`;
    const total = _currentHand.length + 1;
    const slots = slotsFor(total);
    let gi = total - 1;
    for (let i = 0; i < total; i++) { if (px < slots[i].cx) { gi = i; break; } }
    _drawDrag.gapIndex = gi;
    let oi = 0;
    for (let i = 0; i < total; i++) {
      if (i === gi) continue;
      const c = _currentHand[oi++]; if (!c) continue;
      const el = _handEls[String(c.id)]; if (el) placeCard(el, slots[i]);
    }
  }

  function endDrawDrag() {
    if (!_drawDrag) return;
    if (_drawDrag.card) finalizeDrawDrag();
    else { _drawDrag.released = true; _drawDrag.releaseIndex = _drawDrag.gapIndex; }
  }

  function finalizeDrawDrag() {
    const dd = _drawDrag;
    if (!dd || !dd.card) return;
    const sid = String(dd.card.id);
    const idx = Math.max(0, Math.min(dd.gapIndex, _currentHand.length));
    dd.el.className = 'pf-card pf-hand-card';
    dd.el.dataset.id = sid;
    dd.el.innerHTML = cardFaceHTML(dd.card);
    _handEls[sid] = dd.el;
    attachDrag(dd.card, dd.el);
    _currentHand.splice(idx, 0, dd.card);
    _drawDrag = null;
    layoutHand();
  }

  // Chamada pelo sync quando a carta comprada chega do servidor.
  function adoptDrawCard(card) {
    _drawDrag.cardId = String(card.id);
    _drawDrag.card   = card;
    _drawDrag.el.innerHTML = cardFaceHTML(card);
    if (_drawDrag.released) finalizeDrawDrag();
  }

  function drawDragAdopts(card) {
    if (!_drawDrag) return false;
    if (_drawDrag.source === 'discard') return String(card.id) === _drawDrag.cardId;
    return _drawDrag.cardId === null; // stock: adota a primeira carta nova
  }

  function cancelDrawDrag() {
    if (!_drawDrag) return;
    if (_drawDrag.el) _drawDrag.el.remove();
    _drawDrag = null;
    _skipOwnDrawAnim = false;
    layoutHand();
  }

  // ── Sizes ────────────────────────────────────────────────────────────────
  function computeSizes() {
    const w = window.innerWidth, h = window.innerHeight;
    const portrait = h >= w;
    const base = portrait ? Math.min(w * 0.145, 80) : Math.min(w * 0.068, 92);
    _cw = Math.max(52, base);
    _ch = _cw * 1.4;
    const field = document.getElementById('pfField');
    if (field) {
      field.style.setProperty('--pf-cw', _cw + 'px');
      field.style.setProperty('--pf-ch', _ch + 'px');
    }
  }

  // ── Card HTML ────────────────────────────────────────────────────────────
  function cardFaceHTML(card) {
    const cls = card.color === 'red' ? 'pf-red' : 'pf-black';
    return `<div class="pf-inner"><div class="pf-face">
      <div class="pf-pip ${cls}">${card.suit}</div>
      <div class="pf-rank ${cls}">${card.rank}</div>
    </div></div>`;
  }

  // ── Hand layout ──────────────────────────────────────────────────────────
  function slotsFor(n) {
    const field = document.getElementById('pfField');
    if (!field || !n) return [];
    const fw = field.clientWidth, fh = field.clientHeight;
    let step   = _cw * 0.82;
    let spread = (n - 1) * step + _cw;
    const maxSpread = fw * 0.94;
    if (n > 1 && spread > maxSpread) { step = (maxSpread - _cw) / (n - 1); spread = maxSpread; }
    const startX = fw / 2 - spread / 2;
    const yBase  = fh - _ch - Math.max(10, fh * 0.02);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? (i / (n - 1) - 0.5) : 0;
      const x = startX + i * (n > 1 ? step : 0);
      out.push({ x, cx: x + _cw / 2, y: yBase + Math.abs(t) * Math.min(n * 1.1, 14), rot: t * Math.min(n * 1.2, 9) });
    }
    return out;
  }

  function placeCard(el, slot) {
    el.style.setProperty('--pf-rot', slot.rot);
    el.style.transform = `translate(${slot.x}px,${slot.y}px) rotate(${slot.rot}deg)`;
  }

  function layoutHand() {
    // Durante uma compra arrastada, deixa um espaço aberto no gapIndex (N+1 slots).
    if (_drawDrag) {
      const total = _currentHand.length + 1;
      const slots = slotsFor(total);
      const gi = Math.max(0, Math.min(_drawDrag.gapIndex, _currentHand.length));
      let oi = 0;
      for (let i = 0; i < total; i++) {
        if (i === gi) continue;
        const c = _currentHand[oi++]; if (!c) continue;
        const el = _handEls[String(c.id)];
        if (el && !el.classList.contains('pf-dragging')) placeCard(el, slots[i]);
        if (el) el.style.zIndex = 200 + i;
      }
      updateTray(slots);
      return;
    }
    if (!_currentHand.length) { updateTray([]); return; }
    const slots = slotsFor(_currentHand.length);
    _currentHand.forEach((c, i) => {
      const el = _handEls[String(c.id)];
      if (el && !el.classList.contains('pf-dragging')) placeCard(el, slots[i]);
      if (el) el.style.zIndex = 200 + i;
    });
    updateTray(slots);
  }

  function updateTray(slots) {
    const tray = document.getElementById('pfTray');
    if (!tray) return;
    if (!slots.length) { tray.style.opacity = 0; return; }
    const field = document.getElementById('pfField');
    if (!field) return;
    const fh  = field.clientHeight;
    const pad = 16;
    const left  = slots[0].x - pad;
    const right = slots[slots.length - 1].x + _cw + pad;
    const top   = Math.min(...slots.map(s => s.y)) - pad;
    tray.style.opacity = 1;
    tray.style.left    = left + 'px';
    tray.style.width   = (right - left) + 'px';
    tray.style.top     = top + 'px';
    tray.style.height  = (fh - top) + 'px';
  }

  // ── Drag-to-discard ──────────────────────────────────────────────────────
  function attachDrag(card, el) {
    let grabX = 0, grabY = 0, mode = 'reorder', gapIndex = 0, dragging = false;

    el.addEventListener('pointerdown', e => {
      if (!_lastState) return;
      if (!_lastState) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('pf-dragging'); dragging = true;
      const f  = document.getElementById('pfField').getBoundingClientRect();
      const px = e.clientX - f.left, py = e.clientY - f.top;
      const cur = el.getBoundingClientRect();
      grabX = px - (cur.left - f.left + _cw / 2);
      grabY = py - (cur.top  - f.top  + _ch / 2);
    });

    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const field = document.getElementById('pfField');
      const f  = field.getBoundingClientRect();
      const px = e.clientX - f.left, py = e.clientY - f.top;
      const cx = px - grabX, cy = py - grabY;
      el.style.transform = `translate(${cx - _cw / 2}px,${cy - _ch / 2}px) rotate(0deg) scale(1.07)`;

      const felt  = document.getElementById('pfFelt');
      const discard = document.getElementById('pfDiscardSlot');
      function inEl(domEl) {
        const r = domEl.getBoundingClientRect();
        return px > r.left - f.left && px < r.right - f.left && py > r.top - f.top && py < r.bottom - f.top;
      }
      if (felt && inEl(felt)) {
        mode = 'discard';
        if (discard) discard.classList.add('pf-hot');
        const others = _currentHand.filter(c => c.id !== card.id);
        const os     = slotsFor(others.length);
        others.forEach((c, i) => { const oel = _handEls[String(c.id)]; if (oel) placeCard(oel, os[i]); });
      } else {
        mode = 'reorder';
        if (discard) discard.classList.remove('pf-hot');
        const n     = _currentHand.length;
        const slots = slotsFor(n);
        gapIndex = n - 1;
        for (let i = 0; i < n; i++) { if (px < slots[i].cx) { gapIndex = i; break; } }
        const others = _currentHand.filter(c => c.id !== card.id);
        let oi = 0;
        for (let i = 0; i < n; i++) {
          if (i === gapIndex) continue;
          const oel = _handEls[String(others[oi]?.id)]; if (oel) placeCard(oel, slots[i]); oi++;
        }
      }
    });

    const end = e => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('pf-dragging');
      const discard = document.getElementById('pfDiscardSlot');
      if (discard) discard.classList.remove('pf-hot');
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}

      if (mode === 'discard') {
        if (_currentHand.length < 10) {
          showToast('Compre uma carta antes de descartar');
          layoutHand();
        } else {
          _sendAction({ type: 'discard', cardId: card.id });
        }
      } else {
        const others = _currentHand.filter(c => c.id !== card.id);
        others.splice(gapIndex, 0, card);
        _currentHand = others;
        layoutHand();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ── Sync hand elements ───────────────────────────────────────────────────
  // Mantém a ORDEM LOCAL da mão (o servidor só conhece o conjunto de cartas):
  // remove as que saíram e adiciona as novas no fim — sem resetar a ordem.
  function syncHandElements(state) {
    const myHand    = state.myHand || [];
    const myHandIds = new Set(myHand.map(c => String(c.id)));

    // Remove elements no longer in hand
    for (const id of Object.keys(_handEls)) {
      if (!myHandIds.has(id)) { _handEls[id].remove(); delete _handEls[id]; }
    }
    // Mantém ordem local; descarta da ordem as cartas que saíram
    _currentHand = _currentHand.filter(c => myHandIds.has(String(c.id)));
    const have = new Set(_currentHand.map(c => String(c.id)));

    const field = document.getElementById('pfField');

    for (const card of myHand) {
      const sid = String(card.id);
      if (have.has(sid)) continue;

      // Carta nova controlada por uma compra arrastada: não posiciona aqui
      if (drawDragAdopts(card)) { adoptDrawCard(card); continue; }

      // Carta nova normal: cria elemento e adiciona no fim da ordem local
      const el = document.createElement('div');
      el.className = 'pf-card pf-hand-card';
      el.dataset.id = sid;
      el.innerHTML = cardFaceHTML(card);
      field.appendChild(el);
      _handEls[sid] = el;
      attachDrag(card, el);

      // Start from table centre, transitions to hand position
      const fx = field.clientWidth / 2, fy = field.clientHeight * 0.48;
      el.style.transition = 'none';
      el.style.transform  = `translate(${fx - _cw / 2}px,${fy - _ch / 2}px) scale(0.8)`;
      requestAnimationFrame(() => { el.style.transition = ''; });

      _currentHand.push(card);
      have.add(sid);
    }
  }

  // ── Render avatars ───────────────────────────────────────────────────────
  function renderAvatars(state) {
    const container = document.getElementById('pfAvatars');
    if (!container) return;
    container.innerHTML = '';
    state.players.forEach((p, idx) => {
      if (p.playerId === _myId) return;
      const div = document.createElement('div');
      div.className = 'pf-player';
      div.innerHTML = `
        <div class="pf-avatar" id="pfAv_${p.playerId}"></div>
        <div class="pf-player-name">${escapeHtml(p.playerName)}</div>
        ${p.handCount >= 10 ? '<div class="pf-addcard"></div>' : ''}`;
      container.appendChild(div);
    });
    if (typeof renderSprite === 'function') {
      state.players.forEach((p, idx) => {
        const el = document.getElementById(`pfAv_${p.playerId}`);
        if (!el) return;
        const av = avatarOf(p, idx);
        renderSprite(el, av.kind, av.color, 36);
      });
    }
  }

  // ── Render piles ─────────────────────────────────────────────────────────
  function renderPiles(state) {
    const discardSlot = document.getElementById('pfDiscardSlot');
    const stockSlot   = document.getElementById('pfStockSlot');
    if (!discardSlot || !stockSlot) return;

    discardSlot.innerHTML = '';
    if (state.discardTop) {
      const c = document.createElement('div');
      c.className = 'pf-card';
      c.style.cssText = 'transform:rotate(-10deg);position:absolute;left:0;top:0;';
      c.innerHTML = cardFaceHTML(state.discardTop);
      discardSlot.appendChild(c);
    }

    stockSlot.querySelectorAll('.pf-card,.pf-stockcount').forEach(e => e.remove());
    if (state.stockCount > 0) {
      const back = document.createElement('div');
      back.className = 'pf-card';
      back.style.cssText = 'position:absolute;left:0;top:0;';
      back.innerHTML = '<div class="pf-inner"><div class="pf-back-face"></div></div>';
      stockSlot.appendChild(back);
      const cnt = document.createElement('div');
      cnt.className = 'pf-stockcount'; cnt.textContent = state.stockCount;
      stockSlot.appendChild(cnt);
    }
  }

  // ── Interactions & hint ──────────────────────────────────────────────────
  function updateInteractions(_state) {}

  // ── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.getElementById('pfToast');
    if (!t) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    t.textContent = msg;
    t.classList.add('pf-toast--visible');
    _toastTimer = setTimeout(() => t.classList.remove('pf-toast--visible'), 2500);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Fly animation ────────────────────────────────────────────────────────
  function animFly({ fromRect, toRect, card, isBack }) {
    const field = document.getElementById('pfField');
    if (!field) return;
    const fr = field.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'pf-card pf-anim-fly';
    el.innerHTML = isBack
      ? '<div class="pf-inner"><div class="pf-back-face"></div></div>'
      : cardFaceHTML(card);
    field.appendChild(el);

    const sx = fromRect.left - fr.left + fromRect.width  / 2 - _cw / 2;
    const sy = fromRect.top  - fr.top  + fromRect.height / 2 - _ch / 2;
    el.style.cssText = `left:0;top:0;z-index:20000;transition:none;opacity:1;transform:translate(${sx}px,${sy}px) scale(0.85);`;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const tx = toRect.left - fr.left + toRect.width  / 2 - _cw / 2;
      const ty = toRect.top  - fr.top  + toRect.height / 2 - _ch / 2;
      el.style.transition = 'transform 0.42s cubic-bezier(.22,.9,.3,1), opacity 0.12s 0.32s';
      el.style.transform  = `translate(${tx}px,${ty}px) scale(0.9)`;
      el.style.opacity    = '0';
      setTimeout(() => el.remove(), 560);
    }));
  }

  function avatarRect(playerId) {
    const el = document.getElementById(`pfAv_${playerId}`);
    return el ? el.getBoundingClientRect() : null;
  }

  function myHandRect() {
    const tray = document.getElementById('pfTray');
    if (tray && parseFloat(tray.style.opacity) > 0) return tray.getBoundingClientRect();
    const field = document.getElementById('pfField');
    if (!field) return null;
    const fr = field.getBoundingClientRect();
    return { left: fr.left + fr.width / 2 - 40, top: fr.top + fr.height - 80, width: 80, height: 60 };
  }

  // ── Main render ──────────────────────────────────────────────────────────
  function render(state, sendAction) {
    _sendAction = sendAction;
    _lastState  = state;
    if (!_el) return;

    const resetBtn = document.getElementById('pfResetBtn');
    if (resetBtn) resetBtn.classList.toggle('pf-btn-reset--hidden', !_isHost);

    computeSizes();
    syncHandElements(state);
    layoutHand();
    renderAvatars(state);
    renderPiles(state);
    updateInteractions(state);
  }

  // ── Module interface ──────────────────────────────────────────────────────
  window.GameModule = {
    init(container, myPlayerId, myPlayerName, isHost) {
      _el     = container;
      _myId   = myPlayerId;
      _isHost = isHost;
      buildDOM(container);
      computeSizes();
      // Re-layout quando o container ganha dimensões (ex.: o CSS do jogo carrega
      // depois do primeiro render), evitando a mão presa no centro da tela.
      if (_ro) _ro.disconnect();
      const field = document.getElementById('pfField');
      if (field && 'ResizeObserver' in window) {
        _ro = new ResizeObserver(() => { computeSizes(); layoutHand(); });
        _ro.observe(field);
      }
      window.addEventListener('resize', () => { computeSizes(); layoutHand(); });
      window.addEventListener('orientationchange', () => setTimeout(() => { computeSizes(); layoutHand(); }, 200));
    },

    render(state, sendAction) {
      render(state, sendAction);
    },

    onReset() {
      if (_drawDrag && _drawDrag.el) _drawDrag.el.remove();
      _drawDrag    = null;
      _skipOwnDrawAnim = false;
      for (const el of Object.values(_handEls)) el.remove();
      _handEls     = {};
      _currentHand = [];
      _lastState   = null;
    },

    onError(message) {
      cancelDrawDrag();
      showToast(message);
    },

    onAnimate(data) {
      const stockEl   = document.getElementById('pfStockSlot');
      const discardEl = document.getElementById('pfDiscardSlot');
      if (!stockEl || !discardEl) return;

      // Compra própria feita por arraste: a carta já é controlada pelo gesto.
      if ((data.type === 'draw-stock' || data.type === 'draw-discard') &&
          data.playerId === _myId && _skipOwnDrawAnim) {
        _skipOwnDrawAnim = false;
        return;
      }

      if (data.type === 'draw-stock') {
        const toRect = data.playerId === _myId ? myHandRect() : avatarRect(data.playerId);
        if (toRect) animFly({ fromRect: stockEl.getBoundingClientRect(), toRect, isBack: true });
      } else if (data.type === 'draw-discard') {
        const toRect = data.playerId === _myId ? myHandRect() : avatarRect(data.playerId);
        if (toRect && data.card) animFly({ fromRect: discardEl.getBoundingClientRect(), toRect, card: data.card });
      } else if (data.type === 'discard') {
        if (data.playerId === _myId) return;
        const fromRect = avatarRect(data.playerId);
        if (fromRect && data.card) animFly({ fromRect, toRect: discardEl.getBoundingClientRect(), card: data.card });
      }
    },
  };
})();
