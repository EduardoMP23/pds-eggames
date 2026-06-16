(function () {
  // ── Constants ─────────────────────────────────────────────────────────────────

  const ROLE_IMAGES = {
    duke:       '/assets/coup/duque.png',
    assassin:   '/assets/coup/assassino.png',
    captain:    '/assets/coup/capitao.png',
    ambassador: '/assets/coup/embaixador.png',
    contessa:   '/assets/coup/contessa.png',
  };
  const ROLE_LABELS = {
    duke: 'Duque', assassin: 'Assassino', captain: 'Capitão',
    ambassador: 'Embaixador', contessa: 'Condessa',
  };

  // ── Module state ──────────────────────────────────────────────────────────────

  let _el             = null;
  let _myPlayerId     = null;
  let _isHost         = false;
  let _sendAction     = null;
  let _lastState      = null;
  let _longPressTimer = null;        // deck long press
  let _cardPressTimer = null;        // card hold timer
  let _cardPressIdx   = null;        // which card is being held
  let _longPressFired = false;       // whether current hold became a long press
  let _flippedCards      = new Set();  // indices of cards currently showing face
  const _flippedRoles    = {};         // idx → role when card was flipped (detects reset)
  const _tapState        = {};         // per-card: { count, timer }
  let _exchangeAnimating  = false;     // true while card-exchange animation is running
  let _pendingRenderState  = null;     // state queued during animation
  let _pendingRenderAction = null;     // sendAction queued during animation
  let _exchangingCardIdx   = null;     // own card index being exchanged
  let _pendingFlips        = [];       // elements that need a flip triggered after render

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init(el, myPlayerId, myPlayerName, isHost) {
    _el         = el;
    _myPlayerId = myPlayerId;
    _isHost     = !!isHost;

    _el.innerHTML = `
      <div class="coup-layout">

        <!-- HEADER: back, reset (host only), help -->
        <div class="coup-header">
          <div class="coup-header-left">
            <img src="/assets/coup/btn-voltar.png" class="coup-btn-icon" id="coupBackBtn" alt="Voltar">
            <img src="/assets/coup/btn-reset.png" class="coup-btn-icon" id="coupResetBtn" alt="Reiniciar" style="display:none">
          </div>
          <div class="coup-header-right">
            <img src="/assets/coup/btn-ajuda.png" class="coup-btn-icon" id="coupHelpBtn" alt="Ajuda">
          </div>
        </div>

        <!-- ARENA: poker table + opponents around it -->
        <div class="coup-arena">
          <div class="coup-table-wrapper">
            <div class="coup-table">
              <div class="coup-table-center">
                <div class="coup-bank-area" id="coupPileImg">
                  <img src="/assets/coup/monte-moedas.png" class="coup-center-img" alt="Banco de moedas">
                </div>
                <div class="coup-deck-area" id="coupDeckImg">
                  <img src="/assets/coup/baralho.png" class="coup-center-img" alt="Baralho">
                </div>
              </div>
            </div>
            <div class="coup-opponents" id="coupOpponents"></div>
          </div>
        </div>

        <!-- BOTTOM: player's own cards and coin counter -->
        <div class="coup-bottom-bar">
          <div class="coup-own-cards" id="coupOwnCards"></div>
          <div class="coup-own-counter" id="coupOwnCounter">
            <img src="/assets/coup/moeda.png" class="coup-counter-coin-img" alt="">
            <span class="coup-counter-num" id="coupBottomNum">0</span>
          </div>
        </div>

        <!-- Exchange overlay (ambassador action) -->
        <div class="coup-exchange-overlay" id="coupExchangeOverlay" style="display:none"></div>

        <!-- Toast feedback -->
        <div class="coup-toast" id="coupToast"></div>

      </div>
    `;

    setupBankInteraction();
    setupDeckInteraction();
    setupCoinReturn();
    setupHeaderButtons();
  }

  // ── Interaction setup ─────────────────────────────────────────────────────────

  function setupHeaderButtons() {
    // ── Voltar: saída individual — devolve cartas/moedas e sai da partida ─────
    window.holdToConfirm(document.getElementById('coupBackBtn'), () => {
      _sendAction && _sendAction({ type: 'leave' });
      // fallback: se o servidor não responder com game:left, navega mesmo assim
      setTimeout(() => { window.location.href = '/'; }, 1000);
    });

    // ── Reset: apenas host, requer segurar 2s ──────────────────────────────────
    window.holdToConfirm(document.getElementById('coupResetBtn'), () => {
      _flippedCards.clear();
      Object.keys(_flippedRoles).forEach(k => delete _flippedRoles[k]);
      _sendAction && _sendAction({ type: 'reset' });
      showToast('Jogo reiniciado');
    });

    // ── Ajuda: abre o manual oficial do Coup ──────────────────────────────────
    document.getElementById('coupHelpBtn')?.addEventListener('click', () => {
      window.GameHelp?.open('coup');
    });
  }

  function setupBankInteraction() {
    document.getElementById('coupPileImg')?.addEventListener('click', () => {
      _sendAction && _sendAction({ type: 'take-coin' });
    });
  }

  function setupCoinReturn() {
    document.getElementById('coupOwnCounter')?.addEventListener('click', () => {
      _sendAction && _sendAction({ type: 'return-coin' });
    });
  }

  function setupDeckInteraction() {
    const deck = document.getElementById('coupDeckImg');
    if (!deck) return;

    deck.addEventListener('contextmenu', e => e.preventDefault());

    deck.addEventListener('pointerdown', e => {
      e.preventDefault();
      deck.setPointerCapture(e.pointerId);
      _longPressTimer = setTimeout(() => {
        _longPressTimer = null;
        _sendAction && _sendAction({ type: 'ambassador-start' });
        showToast('Segurando o baralho...');
      }, 700);
    });

    deck.addEventListener('pointerup', e => {
      e.preventDefault();
      if (_longPressTimer !== null) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
        if (_lastState) showToast(`${_lastState.deckCount} carta${_lastState.deckCount !== 1 ? 's' : ''} no baralho`);
      }
    });

    deck.addEventListener('pointercancel', () => {
      if (_longPressTimer !== null) { clearTimeout(_longPressTimer); _longPressTimer = null; }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function render(state, sendAction) {
    _sendAction = sendAction;

    if (_exchangeAnimating) {
      _pendingRenderState  = state;
      _pendingRenderAction = sendAction;
      return;
    }

    const prevState = _lastState;

    // Detect coin and exchange changes since last state and animate
    if (prevState) {
      for (const player of state.players) {
        const prev = prevState.players.find(p => p.playerId === player.playerId);
        if (!prev) continue;
        if (player.coins > prev.coins) {
          animateCoinFly(player.playerId);
        } else if (player.coins < prev.coins) {
          animateCoinReturn(player.playerId);
        }
        // Ambassador exchange just finished for this player
        if (prev.isExchanging && !player.isExchanging) {
          animateCardFly(player.playerId, false);
          setTimeout(() => animateCardFly(player.playerId, false), 180);
        }
      }
    }

    _lastState  = state;

    // Mostrar botão de reset apenas para o host atual
    const resetBtn = document.getElementById('coupResetBtn');
    if (resetBtn) resetBtn.style.display = state.hostPlayerId === _myPlayerId ? '' : 'none';

    const me = state.players.find(p => p.playerId === _myPlayerId);
    const coins = me ? me.coins : 0;

    setText('coupTopNum',    coins);
    setText('coupBottomNum', coins);
    setText('coupBankCount', state.bankCoins);
    setText('coupDeckCount', state.deckCount);

    _pendingFlips = [];
    renderOwnCards(me, prevState);
    renderOpponents(state, prevState);
    renderExchange(state, me);

    // Trigger flip animations: elements were added to DOM without `flipped`,
    // double-RAF ensures the browser painted the initial state first.
    // `is-revealed` (grayscale + ✕) is added only after the flip completes
    // so the animation looks identical to the peek-flip.
    if (_pendingFlips.length) {
      const toFlip = _pendingFlips;
      _pendingFlips = [];
      requestAnimationFrame(() => requestAnimationFrame(() => {
        toFlip.forEach(({ inner }) => {
          inner.classList.add('flipped');
        });
      }));
    }

    if (state.status === 'finished') {
      showToast(`Fim de jogo! Vencedor: ${esc(state.winnerName)}`);
    }
  }

  // ── Own cards ─────────────────────────────────────────────────────────────────

  function renderOwnCards(me, prevState) {
    const el = document.getElementById('coupOwnCards');
    if (!el || !me) return;

    el.innerHTML = '';

    // Detectar reinício: estado anterior tinha carta(s) revealed, novo não tem nenhuma
    if (prevState) {
      const prevMe = prevState.players.find(p => p.playerId === _myPlayerId);
      const hadRevealed = prevMe?.influence.some(c => c.revealed);
      const hasRevealed = me.influence.some(c => c.revealed);
      if (hadRevealed && !hasRevealed) {
        _flippedCards.clear();
        for (const k in _flippedRoles) delete _flippedRoles[k];
      }
    }

    // Se o role de uma carta virada mudou, é uma nova carta (troca/reset) — vira de volta
    me.influence.forEach((card, idx) => {
      if (_flippedCards.has(idx) && !card.revealed && _flippedRoles[idx] && _flippedRoles[idx] !== card.role) {
        _flippedCards.delete(idx);
        delete _flippedRoles[idx];
      }
    });

    me.influence.forEach((card, idx) => {
      // Permanently revealed cards always show face-up
      if (card.revealed) { _flippedCards.add(idx); _flippedRoles[idx] = card.role; }
      const isFlipped = _flippedCards.has(idx);

      const slot = document.createElement('div');
      slot.className = 'coup-card-slot' + (card.revealed ? ' is-revealed' : '');

      const inner = document.createElement('div');
      inner.className = 'coup-card-inner' + (isFlipped ? ' flipped' : '') + (card.revealed ? ' instant' : '');
      inner.id = `coupCardInner${idx}`;

      // Front face: card back image
      const front = document.createElement('div');
      front.className = 'coup-card-face coup-card-front';
      const frontImg = document.createElement('img');
      frontImg.src       = '/assets/coup/carta-verso.png';
      frontImg.className = 'coup-card-front-img';
      frontImg.alt       = 'carta';
      front.appendChild(frontImg);

      // Back face: role image
      const back = document.createElement('div');
      back.className = 'coup-card-face coup-card-back';
      const backImg = document.createElement('img');
      backImg.src = ROLE_IMAGES[card.role] || '/assets/coup/carta-verso.png';
      backImg.className = 'coup-card-img';
      backImg.alt = ROLE_LABELS[card.role] || card.role;
      back.appendChild(backImg);

      inner.appendChild(front);
      inner.appendChild(back);
      slot.appendChild(inner);

      // ── Card interactions ─────────────────────────────────────────────────
      // Skip interaction on permanently-revealed (dead) cards
      if (card.revealed) {
        el.appendChild(slot);
        return;
      }

      slot.addEventListener('contextmenu', e => e.preventDefault());

      if (!_tapState[idx]) _tapState[idx] = { count: 0, timer: null };

      function onPressStart() {
        _longPressFired = false;
        _cardPressIdx   = idx;

        // Hold timer only fires when card is already face-up
        if (_flippedCards.has(idx)) {
          _cardPressTimer = setTimeout(() => {
            _cardPressTimer = null;
            _longPressFired = true;
            // Cancel any pending tap
            if (_tapState[idx].timer) {
              clearTimeout(_tapState[idx].timer);
              _tapState[idx] = { count: 0, timer: null };
            }
            _sendAction && _sendAction({ type: 'reveal-card', cardIndex: idx });
            showToast('Influência perdida');
          }, 700);
        }
      }

      function onPressEnd() {
        if (_cardPressIdx !== idx) return;

        if (_longPressFired) {
          _longPressFired = false;
          return;
        }

        if (_cardPressTimer !== null) {
          clearTimeout(_cardPressTimer);
          _cardPressTimer = null;
        }

        // Double-tap detection: register tap and wait 280ms for a second
        const t = _tapState[idx];
        t.count++;
        if (t.timer) clearTimeout(t.timer);
        t.timer = setTimeout(() => {
          const n = t.count;
          t.count = 0;
          t.timer = null;

          if (n >= 2) {
            // Double tap → exchange card with deck
            _exchangingCardIdx = idx;
            _sendAction && _sendAction({ type: 'return-card-to-deck', cardIndex: idx });
            _flippedCards.delete(idx);
            showToast('Carta trocada com o baralho');
          } else {
            // Single tap → toggle flip
            toggleCardFlip(idx);
          }
        }, 280);
      }

      function onPressCancel() {
        if (_cardPressTimer !== null) { clearTimeout(_cardPressTimer); _cardPressTimer = null; }
        _longPressFired = false;
      }

      slot.addEventListener('pointerdown', e => {
        e.preventDefault();
        slot.setPointerCapture(e.pointerId); // keep events even if pointer drifts out
        onPressStart();
      });
      slot.addEventListener('pointerup',     e => { e.preventDefault(); onPressEnd();    });
      slot.addEventListener('pointercancel', onPressCancel);

      el.appendChild(slot);
    });
  }

  function toggleCardFlip(idx) {
    const inner = document.getElementById(`coupCardInner${idx}`);
    if (!inner) return;

    if (_flippedCards.has(idx)) {
      _flippedCards.delete(idx);
      delete _flippedRoles[idx];
      inner.classList.remove('flipped');
    } else {
      _flippedCards.add(idx);
      // Guarda o role atual para detectar reset futuro
      const card = _lastState?.players?.find(p => p.playerId === _myPlayerId)?.influence?.[idx];
      if (card?.role) _flippedRoles[idx] = card.role;
      inner.classList.add('flipped');
    }
  }

  // ── Opponent cards around the table ──────────────────────────────────────────

  function renderOpponents(state, prevState) {
    const el = document.getElementById('coupOpponents');
    if (!el) return;

    const opponents = state.players.filter(p => p.playerId !== _myPlayerId);
    const n = opponents.length;

    el.innerHTML = '';
    if (n === 0) return;

    const angles = getOpponentAngles(n);

    opponents.forEach((opp, i) => {
      const rad = (angles[i] * Math.PI) / 180;
      // r=42% → group centers sit near the table edge (table radius = 50% of wrapper)
      const x = 50 + 42 * Math.sin(rad);
      const y = 50 - 42 * Math.cos(rad);

      const group = document.createElement('div');
      group.className = 'coup-opp-group';
      group.dataset.playerId = opp.playerId;
      group.style.left      = x + '%';
      group.style.top       = y + '%';
      group.style.transform = `translate(-50%, -50%) rotate(${angles[i]}deg)`;

      const cardsEl = document.createElement('div');
      cardsEl.className = 'coup-opp-cards';

      const prevOpp = prevState?.players.find(p => p.playerId === opp.playerId);

      opp.influence.forEach((card, cardIdx) => {
        const prevCard      = prevOpp?.influence[cardIdx];
        const justRevealed  = card.revealed && !prevCard?.revealed;

        const cardEl = document.createElement('div');
        cardEl.className = 'coup-opp-card' + (card.revealed ? ' is-revealed' : '');

        // Flip container — for brand-new reveals, start without `flipped` and queue it
        const inner = document.createElement('div');
        if (justRevealed) {
          inner.className = 'coup-opp-card-inner';
          _pendingFlips.push({ inner });
        } else {
          inner.className = 'coup-opp-card-inner' + (card.revealed ? ' flipped instant' : '');
        }

        // Front face: card back
        const front = document.createElement('div');
        front.className = 'coup-opp-card-face coup-opp-card-front';
        const frontImg = document.createElement('img');
        frontImg.src = '/assets/coup/carta-verso.png';
        frontImg.alt = 'carta';
        front.appendChild(frontImg);

        // Back face: role image
        const back = document.createElement('div');
        back.className = 'coup-opp-card-face coup-opp-card-back';
        const backImg = document.createElement('img');
        backImg.src = card.revealed
          ? (ROLE_IMAGES[card.role] || '/assets/coup/carta-verso.png')
          : '/assets/coup/carta-verso.png';
        backImg.alt = card.revealed ? (ROLE_LABELS[card.role] || card.role) : 'carta';
        back.appendChild(backImg);

        inner.appendChild(front);
        inner.appendChild(back);
        cardEl.appendChild(inner);
        cardsEl.appendChild(cardEl);
      });

      // Player name — counter-rotated so it stays upright
      const nameEl = document.createElement('div');
      nameEl.className = 'coup-opp-name';
      nameEl.style.transform = `rotate(${-angles[i]}deg)`;
      nameEl.textContent = opp.playerName;

      // Coin counter — counter-rotated so the number stays upright
      const counter = document.createElement('div');
      counter.className = 'coup-opp-counter';
      counter.style.transform = `rotate(${-angles[i]}deg)`;

      const coinImg = document.createElement('img');
      coinImg.src = '/assets/coup/moeda.png';
      coinImg.className = 'coup-counter-coin-img';
      coinImg.alt = '';

      const coinNum = document.createElement('span');
      coinNum.className = 'coup-counter-num';
      coinNum.textContent = opp.coins ?? 0;

      counter.appendChild(coinImg);
      counter.appendChild(coinNum);

      group.appendChild(nameEl);
      group.appendChild(cardsEl);
      group.appendChild(counter);
      el.appendChild(group);
    });
  }

  // Angle 0° = 12 o'clock, clockwise. Presets keep opponents in the upper arc.
  function getOpponentAngles(n) {
    switch (n) {
      case 1: return [0];
      case 2: return [-50, 50];
      case 3: return [-90, 0, 90];
      case 4: return [-110, -37, 37, 110];
      case 5: return [-120, -60, 0, 60, 120];
      default: {
        const step = 240 / (n - 1);
        return Array.from({ length: n }, (_, i) => -120 + step * i);
      }
    }
  }

  // ── Ambassador exchange ───────────────────────────────────────────────────────

  function renderExchange(state, me) {
    const overlay = document.getElementById('coupExchangeOverlay');
    if (!overlay) return;

    if (!state.exchangeOptions || state.exchangeOptions.length === 0) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'flex';

    const ownUnrevealed = me ? me.influence.filter(c => !c.revealed) : [];
    const keepCount     = ownUnrevealed.length;
    const allOptions    = [...ownUnrevealed.map(c => c.role), ...state.exchangeOptions];
    const selected      = new Set();

    const draw = () => {
      overlay.innerHTML = `
        <div class="coup-exchange-panel">
          <div class="coup-exchange-title">Escolha ${keepCount} carta${keepCount !== 1 ? 's' : ''} para manter</div>
          <div class="coup-exchange-cards">
            ${allOptions.map((role, i) => `
              <div class="coup-ex-card ${selected.has(i) ? 'selected' : ''}" data-i="${i}">
                <img src="${ROLE_IMAGES[role] || '/assets/coup/carta-verso.png'}"
                     alt="${esc(ROLE_LABELS[role] || role)}">
                <span>${esc(ROLE_LABELS[role] || role)}</span>
              </div>
            `).join('')}
          </div>
          <button class="coup-exchange-confirm" id="coupExConfirm"
            ${selected.size !== keepCount ? 'disabled' : ''}>
            Confirmar
          </button>
        </div>
      `;

      overlay.querySelectorAll('.coup-ex-card').forEach(card => {
        card.addEventListener('click', () => {
          const i = parseInt(card.dataset.i);
          if (selected.has(i)) {
            selected.delete(i);
          } else if (selected.size < keepCount) {
            selected.add(i);
          } else {
            // Já atingiu o limite: remove o mais antigo e adiciona o novo
            const [oldest] = selected;
            selected.delete(oldest);
            selected.add(i);
          }
          draw();
        });
      });

      const confirmBtn = document.getElementById('coupExConfirm');
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.addEventListener('click', () => {
          _sendAction && _sendAction({ type: 'ambassador-choose', keep: [...selected] });
          // Reset flip states after exchange
          _flippedCards.clear();
        });
      }
    };

    draw();
  }

  // ── Coin fly animation ────────────────────────────────────────────────────────

  function animateCoinFly(playerId) {
    const tableWrapper = document.querySelector('.coup-table-wrapper');
    if (!tableWrapper) return;

    // Destination: own counter or the opponent's counter on the table
    let destEl;
    if (playerId === _myPlayerId) {
      destEl = document.getElementById('coupOwnCounter');
    } else {
      destEl = document.querySelector(`.coup-opp-group[data-player-id="${playerId}"] .coup-opp-counter`);
    }
    if (!destEl) return;

    // Origin: top of a random one of the 3 coin stacks inside the pile image.
    // Offsets below are fractions of the image rect measured from the PNG:
    //   stack 0 – tall pile on the left   (cx≈24%, top≈8%)
    //   stack 1 – medium pile upper-right (cx≈68%, top≈3%)
    //   stack 2 – single coin lower-right (cx≈67%, top≈57%)
    const pileEl   = document.getElementById('coupPileImg');
    const fromRect = (pileEl || tableWrapper).getBoundingClientRect();
    const toRect   = destEl.getBoundingClientRect();

    const stacks = [
      { cx: 0.24, ty: 0.08 },
      { cx: 0.68, ty: 0.03 },
      { cx: 0.67, ty: 0.57 },
    ];
    const s = stacks[Math.floor(Math.random() * stacks.length)];
    const startX = fromRect.left + fromRect.width  * s.cx;
    const startY = fromRect.top  + fromRect.height * s.ty;
    const dx     = (toRect.left  + toRect.width  / 2) - startX;
    const dy     = (toRect.top   + toRect.height / 2) - startY;

    const coin = document.createElement('img');
    coin.src = '/assets/coup/moeda.png';
    coin.style.cssText = `
      position: fixed;
      width: 38px;
      height: 38px;
      left: ${startX}px;
      top: ${startY}px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 999;
      filter: drop-shadow(0 3px 8px rgba(0,0,0,0.45));
    `;
    document.body.appendChild(coin);

    coin.animate([
      { transform: 'translate(-50%,-50%) scale(0.35)',                                                       opacity: 1, offset: 0    },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.3 - 40}px)) scale(0.85)`,  opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.4)`,                      opacity: 1, offset: 1    },
    ], { duration: 2000, easing: 'ease-in-out', fill: 'forwards' })
      .finished.then(() => coin.remove());
  }

  // ── Coin return animation (player → pile) ────────────────────────────────────

  function animateCoinReturn(playerId) {
    const pileEl = document.getElementById('coupPileImg');
    const counterEl = playerId === _myPlayerId
      ? document.getElementById('coupOwnCounter')
      : document.querySelector(`.coup-opp-group[data-player-id="${playerId}"] .coup-opp-counter`);
    if (!pileEl || !counterEl) return;

    const fromRect = counterEl.getBoundingClientRect();
    const toRect   = pileEl.getBoundingClientRect();

    // Same 3-stack offsets used in animateCoinFly
    const stacks = [
      { cx: 0.24, ty: 0.08 },
      { cx: 0.68, ty: 0.03 },
      { cx: 0.67, ty: 0.57 },
    ];
    const s    = stacks[Math.floor(Math.random() * stacks.length)];
    const endX = toRect.left + toRect.width  * s.cx;
    const endY = toRect.top  + toRect.height * s.ty;

    const startX = fromRect.left + fromRect.width  / 2;
    const startY = fromRect.top  + fromRect.height / 2;
    const dx     = endX - startX;
    const dy     = endY - startY;

    const coin = document.createElement('img');
    coin.src = '/assets/coup/moeda.png';
    coin.style.cssText = `
      position: fixed;
      width: 38px;
      height: 38px;
      left: ${startX}px;
      top: ${startY}px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 999;
      filter: drop-shadow(0 3px 8px rgba(0,0,0,0.45));
    `;
    document.body.appendChild(coin);

    coin.animate([
      { transform: 'translate(-50%,-50%) scale(1.4)',                                                        opacity: 1, offset: 0    },
      { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.3 - 40}px)) scale(0.85)`,  opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35)`,                     opacity: 1, offset: 1    },
    ], { duration: 1600, easing: 'ease-in-out', fill: 'forwards' })
      .finished.then(() => coin.remove());
  }

  // ── Card fly helpers ─────────────────────────────────────────────────────────

  function _makeCardSprite(cx, cy) {
    const img = document.createElement('img');
    img.src = '/assets/coup/carta-verso.png';
    img.style.cssText = `
      position: fixed;
      width: 32px; height: 46px;
      left: ${cx}px; top: ${cy}px;
      transform: translate(-50%,-50%);
      pointer-events: none;
      z-index: 999;
      border-radius: 6px;
      filter: drop-shadow(0 3px 8px rgba(0,0,0,.45));
    `;
    return img;
  }

  function _finishExchangeAnimation() {
    _exchangeAnimating  = false;
    _exchangingCardIdx  = null;
    const state = _pendingRenderState;
    const sa    = _pendingRenderAction;
    _pendingRenderState  = null;
    _pendingRenderAction = null;
    if (state) render(state, sa ?? _sendAction);
  }

  // ── Deck shuffle — cards fan out and collapse back ───────────────────────────

  function _animateDeckShuffle(deckCx, deckCy, duration, deckEl) {
    return new Promise(resolve => {
      const COUNT   = 7;
      let done      = 0;
      const deckImg = deckEl?.querySelector('img') || deckEl;
      if (deckImg) deckImg.style.opacity = '0';

      for (let i = 0; i < COUNT; i++) {
        const t        = i / (COUNT - 1);           // 0 → 1
        const angleDeg = -50 + t * 100;             // fan: -50° … +50°
        const angleRad = angleDeg * Math.PI / 180;
        const dist     = 28 + Math.abs(angleDeg) * 0.25;
        const tx       = Math.sin(angleRad) * dist;
        const ty       = -Math.cos(Math.abs(angleRad * 0.7)) * dist * 0.5;
        const rot      = angleDeg * 0.55;           // each card tilts with its angle
        const delay    = i * 18;                    // slight cascade

        const sprite = _makeCardSprite(deckCx, deckCy);
        document.body.appendChild(sprite);

        sprite.animate([
          { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)',                                                                    opacity: 0.9, offset: 0    },
          { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rot}deg) scale(1.08)`,                          opacity: 1,   offset: 0.45 },
          { transform: `translate(calc(-50% + ${tx * 0.15}px), calc(-50% + ${ty * 0.15}px)) rotate(${rot * 0.15}deg) scale(0.95)`,     opacity: 0.7, offset: 0.75 },
          { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)',                                                                    opacity: 0,   offset: 1    },
        ], { duration, delay, easing: 'ease-in-out', fill: 'forwards' })
        .finished.then(() => {
          sprite.remove();
          if (++done === COUNT) {
            if (deckImg) deckImg.style.opacity = '';
            resolve();
          }
        });
      }
    });
  }

  // ── Card exchange animation (return-card-to-deck) ─────────────────────────────
  // Sequence: card flies out → deck shuffles → new card flies in → render new state

  function animateCardExchange(playerId) {
    const isMe   = playerId === _myPlayerId;
    const deckEl = document.getElementById('coupDeckImg');
    if (!deckEl) { _finishExchangeAnimation(); return; }

    _exchangeAnimating = true;

    const deckRect = deckEl.getBoundingClientRect();
    const deckCx   = deckRect.left + deckRect.width  / 2;
    const deckCy   = deckRect.top  + deckRect.height / 2;

    // ── Determine origin and which card to hide ───────────────────────────────
    let originEl = null;
    let cardSlot = null;

    if (isMe) {
      const slots = document.querySelectorAll('#coupOwnCards .coup-card-slot');
      const idx   = _exchangingCardIdx ?? 0;
      cardSlot    = slots[idx] ?? slots[slots.length - 1] ?? null;
      originEl    = cardSlot;
    } else {
      originEl = document.querySelector(`.coup-opp-group[data-player-id="${playerId}"]`);
      // Hide one opponent card so they visually show only 1 during exchange
      const oppCards = originEl?.querySelectorAll('.coup-opp-card:not(.is-revealed)');
      if (oppCards?.length) cardSlot = oppCards[oppCards.length - 1];
    }

    if (!originEl) { _finishExchangeAnimation(); return; }

    const fromRect = originEl.getBoundingClientRect();
    const fromCx   = fromRect.left + fromRect.width  / 2;
    const fromCy   = fromRect.top  + fromRect.height / 2;

    if (cardSlot) cardSlot.style.opacity = '0';

    const FLY     = 1200;
    const SHUFFLE = 1600;
    const RETURN  = 1200;

    // Phase 1 — card flies to deck
    const spriteOut = _makeCardSprite(fromCx, fromCy);
    document.body.appendChild(spriteOut);

    spriteOut.animate([
      { transform: 'translate(-50%,-50%) scale(1)',   opacity: 1,   offset: 0 },
      { transform: `translate(calc(-50% + ${deckCx - fromCx}px), calc(-50% + ${deckCy - fromCy}px)) scale(0.5)`,
        opacity: 0.6, offset: 1 },
    ], { duration: FLY, easing: 'ease-in', fill: 'forwards' })
    .finished.then(() => {
      spriteOut.remove();

      // Phase 2 — deck shuffle (cards fan out)
      _animateDeckShuffle(deckCx, deckCy, SHUFFLE, deckEl).then(() => {
        // Phase 3 — new card flies from deck to origin
        const spriteIn = _makeCardSprite(deckCx, deckCy);
        document.body.appendChild(spriteIn);

        spriteIn.animate([
          { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0.6, offset: 0 },
          { transform: `translate(calc(-50% + ${fromCx - deckCx}px), calc(-50% + ${fromCy - deckCy}px)) scale(1)`,
            opacity: 1, offset: 1 },
        ], { duration: RETURN, easing: 'ease-out', fill: 'forwards' })
        .finished.then(() => {
          spriteIn.remove();
          if (cardSlot) cardSlot.style.opacity = '';
          _finishExchangeAnimation();
        });
      });
    });
  }

  // ── Simple card fly (ambassador draws) ───────────────────────────────────────

  function animateCardFly(playerId, fromDeck) {
    const deckEl = document.getElementById('coupDeckImg');
    if (!deckEl) return;

    let playerEl;
    if (playerId === _myPlayerId) {
      playerEl = document.getElementById('coupOwnCards');
    } else {
      playerEl = document.querySelector(`.coup-opp-group[data-player-id="${playerId}"]`);
    }
    if (!playerEl) return;

    const fromEl   = fromDeck ? deckEl   : playerEl;
    const toEl     = fromDeck ? playerEl : deckEl;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect   = toEl.getBoundingClientRect();

    const startX = fromRect.left + fromRect.width  / 2;
    const startY = fromRect.top  + fromRect.height / 2;
    const dx     = (toRect.left  + toRect.width  / 2) - startX;
    const dy     = (toRect.top   + toRect.height / 2) - startY;

    const sprite = _makeCardSprite(startX, startY);
    document.body.appendChild(sprite);

    sprite.animate([
      { transform: 'translate(-50%,-50%) scale(1)',                                                        opacity: 1,    offset: 0    },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.3 - 40}px)) scale(1.2)`, opacity: 1,    offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.75)`,                   opacity: 0.75, offset: 1    },
    ], { duration: 600, easing: 'ease-in-out', fill: 'forwards' })
      .finished.then(() => sprite.remove());
  }

  function onAnimate({ type, playerId }) {
    if (type === 'return-card-to-deck') {
      animateCardExchange(playerId);
    } else if (type === 'ambassador-start') {
      animateCardFly(playerId, true);
      setTimeout(() => animateCardFly(playerId, true), 180);
    }
  }

  // ── Error / toast ─────────────────────────────────────────────────────────────

  function onError(message) { showToast(message); }

  function showToast(msg) {
    const toast = document.getElementById('coupToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function onReset() {
    _flippedCards.clear();
    for (const k in _flippedRoles) delete _flippedRoles[k];
  }

  window.GameModule = { init, render, onError, onAnimate, onReset };
})();
