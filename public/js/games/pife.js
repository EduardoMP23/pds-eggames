(function () {
  'use strict';

  // ── Module state ────────────────────────────────────────────────────────────
  let _el         = null;
  let _myId       = null;
  let _isHost     = false;
  let _sendAction = null;
  let _lastState  = null;
  let _cw         = 84;
  let _ch         = 117;
  let _toastTimer = null;
  let _ro         = null;     // ResizeObserver: relayout quando o field ganha dimensões

  let hand         = [];      // [{id,rank,suit,color,el,tx,ty,rot,dragging}] — ordem local
  let panX         = 0;       // navegação da mão quando transborda
  let maxPan       = 0;
  let selectedCard = null;    // carta selecionada por toque (mostra "Jogar")
  let _drawDrag    = null;    // arraste de compra (monte/descarte → mão) em andamento
  let _pendingTake = null;    // carta tirada do descarte de forma otimista (aguarda confirmação)

  const FALLBACK_AVATARS = ['knight','wizard','ninja','robot','alien','cat','ghost','skull'];
  const FALLBACK_COLORS  = ['#ff2e88','#00f0ff','#39ff7a','#ffe600','#ff7a1f','#b14aed','#ff3860','#5effc1'];

  function avatarOf(p, idx) {
    return {
      kind:  p.avatar || FALLBACK_AVATARS[idx % FALLBACK_AVATARS.length],
      color: p.color  || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    };
  }

  function field() { return document.getElementById('pfField'); }

  function rectIn(el) {
    const r = el.getBoundingClientRect(), a = field().getBoundingClientRect();
    return {
      x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height,
      cx: r.left - a.left + r.width / 2, cy: r.top - a.top + r.height / 2,
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
  <div id="pfHandArea"></div>
  <button class="pf-handnav" id="pfNavL">&#8249;</button>
  <button class="pf-handnav" id="pfNavR">&#8250;</button>
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

    // Toque fora de qualquer carta da mão cancela a seleção.
    field().addEventListener('pointerdown', e => {
      if (selectedCard && !e.target.closest('.pf-hand-card')) deselectCard();
    });
  }

  // ── Sizes ────────────────────────────────────────────────────────────────
  function computeSizes() {
    const w = window.innerWidth, h = window.innerHeight;
    const portrait = h >= w;
    const base = portrait ? Math.min(w * 0.145, 80) : Math.min(w * 0.068, 92);
    _cw = Math.max(52, base);
    _ch = _cw * 1.4;
    const f = field();
    if (f) {
      f.style.setProperty('--pf-cw', _cw + 'px');
      f.style.setProperty('--pf-ch', _ch + 'px');
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
  function backFaceHTML() {
    return '<div class="pf-inner"><div class="pf-back-face"></div></div>';
  }

  // ── Mão em arco + navegação ────────────────────────────────────────────────
  function arcSlots(n) {
    const f = field();
    if (!f || !n) { maxPan = 0; return []; }
    const fw = f.clientWidth, fh = f.clientHeight;
    let step = _cw * 0.62;
    const natural = (n - 1) * step + _cw;
    const maxView = fw * 0.96;
    const minStep = Math.max(_cw * 0.36, 34);
    if (n > 1 && natural > maxView) step = Math.max(minStep, (maxView - _cw) / (n - 1));
    const spread = (n - 1) * step + _cw;
    maxPan = Math.max(0, (spread - maxView) / 2 + _cw * 0.2);
    panX = Math.max(-maxPan, Math.min(maxPan, panX));

    const startX = fw / 2 - spread / 2 + panX;
    const baseY = fh - _ch - 18;
    const arcDepth = Math.min(8 + n * 1.6, 40);
    const totalAng = Math.min(n * 3, 26);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? (i / (n - 1) - .5) : 0;
      const x = startX + i * (n > 1 ? step : 0);
      out.push({ x, cx: x + _cw / 2, y: baseY + arcDepth * Math.pow(t * 2, 2), rot: t * totalAng });
    }
    return out;
  }

  function placeHandCard(c, s) {
    if (!c || !s) return;
    c.tx = s.x; c.ty = s.y; c.rot = s.rot;
    if (c.el) {
      c.el.style.setProperty('--pf-rot', s.rot);
      c.el.style.transform = `translate(${s.x}px,${s.y}px) rotate(${s.rot}deg)`;
    }
  }

  function layoutHand() {
    // Durante uma compra arrastada, deixa um espaço aberto no gapIndex (N+1 slots).
    if (_drawDrag) {
      const total = hand.length + 1;
      const slots = arcSlots(total);
      const gi = Math.max(0, Math.min(_drawDrag.gapIndex, hand.length));
      let oi = 0;
      for (let i = 0; i < total; i++) {
        if (i === gi) continue;
        const c = hand[oi++]; if (!c) continue;
        if (c.el) c.el.style.zIndex = 300 + i;
        if (!c.dragging) placeHandCard(c, slots[i]);
      }
      updateNav();
      return;
    }
    const n = hand.length;
    const slots = arcSlots(n);
    hand.forEach((c, i) => {
      if (c.el) c.el.style.zIndex = 300 + i;
      if (!c.dragging) placeHandCard(c, slots[i]);
    });
    updateNav();
  }

  function updateNav() {
    const l = document.getElementById('pfNavL'), r = document.getElementById('pfNavR');
    if (!l || !r) return;
    const over = maxPan > 2;
    l.classList.toggle('show', over);
    r.classList.toggle('show', over);
    l.classList.toggle('dim', panX >= maxPan - 2);
    r.classList.toggle('dim', panX <= -maxPan + 2);
  }

  // ── Seleção por toque (botão "Jogar") ──────────────────────────────────────
  function selectCard(card) {
    if (selectedCard && selectedCard !== card) deselectCard();
    selectedCard = card;
    if (card.el) card.el.classList.add('pf-selected');
  }
  function deselectCard() {
    if (!selectedCard) return;
    if (selectedCard.el) selectedCard.el.classList.remove('pf-selected');
    selectedCard = null;
  }

  // ── Construção de carta + interação (tap / arraste) ─────────────────────────
  function buildHandCard(card) {
    const el = document.createElement('div');
    el.className = 'pf-card pf-hand-card';
    el.dataset.id = String(card.id);
    el.innerHTML = cardFaceHTML(card) + '<button class="pf-playbtn">Jogar &#9650;</button>';
    document.getElementById('pfHandArea').appendChild(el);
    card.el = el;
    el.querySelector('.pf-playbtn').addEventListener('pointerdown', e => {
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
      const a = field().getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; mode = 'tap'; startPan = panX;
      grabX = (e.clientX - a.left) - ((card.tx || 0) + _cw / 2);
      grabY = (e.clientY - a.top)  - ((card.ty || 0) + _ch / 2);
    });

    el.addEventListener('pointermove', e => {
      if (!mode) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;

      if (mode === 'tap') {
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4 && maxPan > 2) { mode = 'pan'; deselectCard(); }
        else if (Math.hypot(dx, dy) > 14) { mode = 'drag'; deselectCard(); el.classList.add('pf-dragging'); card.dragging = true; }
        else return;
      }
      if (mode === 'pan') {
        panX = Math.max(-maxPan, Math.min(maxPan, startPan + dx));
        layoutHand();
        return;
      }
      if (mode === 'drag') {
        const a = field().getBoundingClientRect();
        const cx = (e.clientX - a.left) - grabX, cy = (e.clientY - a.top) - grabY;
        el.style.transform = `translate(${cx - _cw / 2}px,${cy - _ch / 2}px) rotate(0deg) scale(1.07)`;
        // alvo: mesa (descartar)
        const felt = rectIn(document.getElementById('pfFelt'));
        const over = cx > felt.x && cx < felt.x + felt.w && cy > felt.y && cy < felt.y + felt.h;
        const discard = document.getElementById('pfDiscardSlot');
        if (discard) discard.classList.toggle('pf-hot', over);
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
        // 1º toque seleciona (levanta a carta + botão); 2º toque recolhe.
        if (selectedCard === card) deselectCard();
        else selectCard(card);
      } else if (mode === 'drag') {
        card.dragging = false; el.classList.remove('pf-dragging');
        const discard = document.getElementById('pfDiscardSlot');
        if (discard) discard.classList.remove('pf-hot');
        if (el.dataset.over === '1') {
          playFromHand(card);
        } else {
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

  // ── Jogar (descartar) ───────────────────────────────────────────────────────
  // No Pife "jogar" = descartar, só permitido com a mão cheia (10 cartas).
  // Espera a confirmação do servidor (syncHand remove a carta) — sem remoção
  // otimista, evitando carta sumir caso o servidor recuse.
  function playFromHand(card) {
    if (hand.length !== 10) { showToast('Compre uma carta antes de descartar'); layoutHand(); return; }
    layoutHand();   // recoloca a carta no lugar (caso tenha vindo de um arraste até a mesa)
    if (_sendAction) _sendAction({ type: 'discard', cardId: card.id });
  }

  // ── Comprar: anima baralho → mão ───────────────────────────────────────────
  function addCardToHand(card) {
    const draw = rectIn(document.getElementById('pfStockSlot'));
    buildHandCard(card);
    hand.push(card);
    // nasce sobre o baralho e voa pro leque
    card.el.style.transition = 'none';
    card.el.style.transform = `translate(${draw.x}px,${draw.y}px) rotate(0deg) scale(.92)`;
    const inner = card.el.querySelector('.pf-inner');
    if (inner) inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.el.style.transition = '';
      layoutHand();
    }));
  }

  // ── Pegar do descarte (tap): anima descarte → mão (otimista) ───────────────
  function takeTopDiscardToHand() {
    if (!_lastState || !_lastState.discardTop) { showToast('Descarte vazio'); return; }
    if (hand.length >= 10) { showToast('Mão cheia — descarte antes de comprar'); return; }
    const card = { ..._lastState.discardTop };
    const disc = rectIn(document.getElementById('pfDiscardSlot'));
    setDiscardTop(null);                 // remove o topo (otimista)
    buildHandCard(card);
    hand.push(card);
    _pendingTake = { card };
    card.el.style.transition = 'none';
    card.el.style.transform = `translate(${disc.x}px,${disc.y}px) rotate(0deg) scale(.92)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { card.el.style.transition = ''; layoutHand(); }));
    if (_sendAction) _sendAction({ type: 'draw-discard' });
  }

  // ── Comprar arrastando (monte/descarte → mão), escolhendo a posição ─────────
  // Tap = compra rápida (carta vai pro fim). Arraste = compra posicionada.
  function attachPileDraw(pileEl, source) {
    if (!pileEl) return;
    let sx = 0, sy = 0, pending = false, dragging = false;

    pileEl.addEventListener('pointerdown', e => {
      if (!_lastState) return;
      pending = true; dragging = false;
      sx = e.clientX; sy = e.clientY;
      try { pileEl.setPointerCapture(e.pointerId); } catch (_) {}
    });

    pileEl.addEventListener('pointermove', e => {
      if (dragging) { updateDrawDrag(e); return; }
      if (!pending) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
      if (hand.length >= 10) { pending = false; showToast('Mão cheia — descarte antes de comprar'); return; }
      if (source === 'discard' && !_lastState.discardTop) { pending = false; showToast('Descarte vazio'); return; }
      pending = false; dragging = true;
      startDrawDrag(source, e);
      updateDrawDrag(e);
    });

    const end = e => {
      try { pileEl.releasePointerCapture(e.pointerId); } catch (_) {}
      if (dragging) {
        dragging = false;
        endDrawDrag();
      } else if (pending) {
        pending = false;
        if (hand.length >= 10) { showToast('Mão cheia — descarte antes de comprar'); return; }
        if (source === 'stock') { if (_sendAction) _sendAction({ type: 'draw-stock' }); }
        else takeTopDiscardToHand();
      }
    };
    pileEl.addEventListener('pointerup', end);
    pileEl.addEventListener('pointercancel', end);
  }

  function startDrawDrag(source, e) {
    const el = document.createElement('div');
    el.className = 'pf-card pf-hand-card pf-dragging';
    el.style.zIndex = 9999;
    let card = null, cardId = null;
    if (source === 'discard') {
      card   = { ..._lastState.discardTop };
      cardId = String(card.id);
      el.innerHTML = cardFaceHTML(card);
      setDiscardTop(null);               // remove o topo (otimista)
    } else {
      el.innerHTML = backFaceHTML();
    }
    document.getElementById('pfHandArea').appendChild(el);
    _drawDrag = { source, cardId, card, el, gapIndex: hand.length, released: false };
    if (_sendAction) _sendAction({ type: source === 'discard' ? 'draw-discard' : 'draw-stock' });
  }

  function updateDrawDrag(e) {
    if (!_drawDrag) return;
    const a = field().getBoundingClientRect();
    const px = e.clientX - a.left, py = e.clientY - a.top;
    _drawDrag.el.style.transform = `translate(${px - _cw / 2}px,${py - _ch / 2}px) rotate(0deg) scale(1.07)`;
    const total = hand.length + 1;
    const slots = arcSlots(total);
    let gi = total - 1;
    for (let i = 0; i < total; i++) { if (px < slots[i].cx) { gi = i; break; } }
    _drawDrag.gapIndex = gi;
    let oi = 0;
    for (let i = 0; i < total; i++) {
      if (i === gi) continue;
      const c = hand[oi++]; if (c && !c.dragging) placeHandCard(c, slots[i]);
    }
  }

  function endDrawDrag() {
    if (!_drawDrag) return;
    if (_drawDrag.card) finalizeDrawDrag();
    else { _drawDrag.released = true; }
  }

  function finalizeDrawDrag() {
    const dd = _drawDrag;
    if (!dd || !dd.card) return;
    const idx = Math.max(0, Math.min(dd.gapIndex, hand.length));
    const card = dd.card;
    buildHandCard(card);
    if (dd.el) {
      card.el.style.transition = 'none';
      card.el.style.transform = dd.el.style.transform || '';
      dd.el.remove();
    }
    hand.splice(idx, 0, card);
    if (dd.source === 'discard') _pendingTake = { card };
    _drawDrag = null;
    requestAnimationFrame(() => requestAnimationFrame(() => { card.el.style.transition = ''; layoutHand(); }));
  }

  // Chamada pelo sync quando a carta comprada chega do servidor.
  function adoptDrawCard(card) {
    _drawDrag.cardId = String(card.id);
    _drawDrag.card   = { ...card };
    _drawDrag.el.innerHTML = cardFaceHTML(card);
    if (_drawDrag.released) finalizeDrawDrag();
  }

  function cancelDrawDrag() {
    if (!_drawDrag) return;
    const wasDiscard = _drawDrag.source === 'discard';
    if (_drawDrag.el) _drawDrag.el.remove();
    _drawDrag = null;
    // descarte: a compra foi recusada — restaura o topo removido otimisticamente
    if (wasDiscard && _lastState && _lastState.discardTop) setDiscardTop(_lastState.discardTop);
    layoutHand();
  }

  // Desfaz a compra do descarte caso o servidor recuse.
  function rollbackPendingTake() {
    if (!_pendingTake) return;
    const card = _pendingTake.card; _pendingTake = null;
    const i = hand.findIndex(c => c.id === card.id);
    if (i !== -1) { if (hand[i].el) hand[i].el.remove(); hand.splice(i, 1); }
    if (_lastState) setDiscardTop(_lastState.discardTop);
    layoutHand();
  }

  // ── Reconciliação da mão (estado do servidor → DOM) ─────────────────────────
  function syncHand(serverHand) {
    const serverIds = new Set(serverHand.map(c => String(c.id)));
    const localIds  = new Set(hand.map(c => String(c.id)));

    // compra do descarte confirmada → não está mais pendente
    if (_pendingTake && serverIds.has(String(_pendingTake.card.id))) _pendingTake = null;

    // remove cartas que saíram da mão (descarte já confirmado pelo servidor)
    hand.filter(c => !serverIds.has(String(c.id))).forEach(c => { if (c.el) c.el.remove(); if (selectedCard === c) deselectCard(); });
    hand = hand.filter(c => serverIds.has(String(c.id)));

    let news = serverHand.filter(c => !localIds.has(String(c.id)));

    // Compra arrastada: a carta comprada é controlada pelo gesto, não entra aqui.
    if (_drawDrag) {
      let adopt = null;
      if (_drawDrag.source === 'discard') adopt = news.find(c => String(c.id) === _drawDrag.cardId);
      else if (_drawDrag.cardId === null && news.length) adopt = news[0];
      if (adopt) { adoptDrawCard(adopt); news = news.filter(c => c.id !== adopt.id); }
    }

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

  // ── Render pilhas ───────────────────────────────────────────────────────────
  function renderStock(state) {
    const stockSlot = document.getElementById('pfStockSlot');
    if (!stockSlot) return;
    stockSlot.querySelectorAll('.pf-card,.pf-stockcount').forEach(e => e.remove());
    if (state.stockCount > 0) {
      const back = document.createElement('div');
      back.className = 'pf-card';
      back.style.cssText = 'position:absolute;left:0;top:0;';
      back.innerHTML = backFaceHTML();
      stockSlot.appendChild(back);
      const cnt = document.createElement('div');
      cnt.className = 'pf-stockcount'; cnt.textContent = state.stockCount;
      stockSlot.appendChild(cnt);
    }
  }

  function setDiscardTop(card) {
    const slot = document.getElementById('pfDiscardSlot');
    if (!slot) return;
    slot.innerHTML = '';
    if (card) {
      const c = document.createElement('div');
      c.className = 'pf-card';
      c.style.cssText = 'transform:rotate(-10deg);position:absolute;left:0;top:0;';
      c.innerHTML = cardFaceHTML(card);
      slot.appendChild(c);
    }
  }

  function renderDiscardFromState(state) {
    const top = state.discardTop;
    // Não brigar com uma compra otimista do topo atual (tap ou arraste em curso).
    if (_pendingTake && top && String(top.id) === String(_pendingTake.card.id)) return;
    if (_drawDrag && _drawDrag.source === 'discard' && top && String(top.id) === _drawDrag.cardId) return;
    setDiscardTop(top);
  }

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

  // ── Fly animation (oponentes) ──────────────────────────────────────────────
  function animFly({ fromRect, toRect, card, isBack }) {
    const f = field();
    if (!f) return;
    const fr = f.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'pf-card pf-anim-fly';
    el.innerHTML = isBack ? backFaceHTML() : cardFaceHTML(card);
    f.appendChild(el);

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

  // ── Main render ──────────────────────────────────────────────────────────
  function render(state, sendAction) {
    _sendAction = sendAction;
    _lastState  = state;
    if (!_el) return;

    const resetBtn = document.getElementById('pfResetBtn');
    if (resetBtn) resetBtn.classList.toggle('pf-btn-reset--hidden', !_isHost);

    computeSizes();
    renderAvatars(state);
    renderStock(state);
    renderDiscardFromState(state);
    syncHand(state.myHand || []);
  }

  // ── Module interface ──────────────────────────────────────────────────────
  window.GameModule = {
    init(container, myPlayerId, myPlayerName, isHost) {
      _el     = container;
      _myId   = myPlayerId;
      _isHost = isHost;
      hand = []; panX = 0; maxPan = 0;
      selectedCard = null; _drawDrag = null; _pendingTake = null;

      buildDOM(container);
      computeSizes();

      const l = document.getElementById('pfNavL'), r = document.getElementById('pfNavR');
      if (l) l.addEventListener('click', () => { panX = Math.min(maxPan, panX + _cw * 2.4); layoutHand(); });
      if (r) r.addEventListener('click', () => { panX = Math.max(-maxPan, panX - _cw * 2.4); layoutHand(); });

      // Re-layout quando o container ganha dimensões (ex.: o CSS do jogo carrega
      // depois do primeiro render), evitando a mão presa no centro da tela.
      if (_ro) _ro.disconnect();
      const f = field();
      if (f && 'ResizeObserver' in window) {
        _ro = new ResizeObserver(() => { computeSizes(); layoutHand(); });
        _ro.observe(f);
      }
      window.addEventListener('resize', () => { computeSizes(); layoutHand(); });
      window.addEventListener('orientationchange', () => setTimeout(() => { computeSizes(); layoutHand(); }, 200));
    },

    render(state, sendAction) {
      render(state, sendAction);
    },

    onReset() {
      if (_drawDrag && _drawDrag.el) _drawDrag.el.remove();
      _drawDrag = null; _pendingTake = null; selectedCard = null;
      hand.forEach(c => { if (c.el) c.el.remove(); });
      hand = []; panX = 0; maxPan = 0;
      const ha = document.getElementById('pfHandArea'); if (ha) ha.innerHTML = '';
      setDiscardTop(null);
      _lastState = null;
    },

    onError(message) {
      cancelDrawDrag();
      rollbackPendingTake();
      showToast(message);
    },

    onAnimate(data) {
      if (data.playerId === _myId) return; // ações próprias já animadas localmente
      const stockEl   = document.getElementById('pfStockSlot');
      const discardEl = document.getElementById('pfDiscardSlot');
      if (!stockEl || !discardEl) return;

      if (data.type === 'draw-stock') {
        const toRect = avatarRect(data.playerId);
        if (toRect) animFly({ fromRect: stockEl.getBoundingClientRect(), toRect, isBack: true });
      } else if (data.type === 'draw-discard') {
        const toRect = avatarRect(data.playerId);
        if (toRect && data.card) animFly({ fromRect: discardEl.getBoundingClientRect(), toRect, card: data.card });
      } else if (data.type === 'discard') {
        const fromRect = avatarRect(data.playerId);
        if (fromRect && data.card) animFly({ fromRect, toRect: discardEl.getBoundingClientRect(), card: data.card });
      }
    },
  };
})();
