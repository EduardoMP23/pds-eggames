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
  let _resetPressTimer = null;       // reset button long press
  let _cardPressTimer = null;        // card hold timer
  let _cardPressIdx   = null;        // which card is being held
  let _longPressFired = false;       // whether current hold became a long press
  let _flippedCards      = new Set();  // indices of cards currently showing face
  const _flippedRoles    = {};         // idx → role when card was flipped (detects reset)
  const _tapState        = {};         // per-card: { count, timer }

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
            <a href="/"><img src="/assets/coup/btn-voltar.png" class="coup-btn-icon" alt="Voltar"></a>
            ${_isHost ? `<img src="/assets/coup/btn-reset.png" class="coup-btn-icon" id="coupResetBtn" alt="Reiniciar">` : ''}
          </div>
          <div class="coup-header-right">
            <img src="/assets/coup/btn-ajuda.png" class="coup-btn-icon" id="coupHelpBtn" alt="Ajuda">
          </div>
        </div>

        <!-- CENTER: bank (coins) and deck -->
        <div class="coup-center">
          <div class="coup-bank-area" id="coupPileImg">
            <img src="/assets/coup/monte-moedas.png" class="coup-center-img" alt="Banco de moedas">
          </div>
          <div class="coup-deck-area" id="coupDeckImg">
            <img src="/assets/coup/baralho.png" class="coup-center-img" alt="Baralho">
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
    // ── Reset: apenas host, requer segurar 700ms ───────────────────────────────
    const resetBtn = document.getElementById('coupResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('contextmenu', e => e.preventDefault());

      resetBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        resetBtn.setPointerCapture(e.pointerId);
        _resetPressTimer = setTimeout(() => {
          _resetPressTimer = null;
          _flippedCards.clear();
          Object.keys(_flippedRoles).forEach(k => delete _flippedRoles[k]);
          _sendAction && _sendAction({ type: 'reset' });
          showToast('Jogo reiniciado');
        }, 700);
      });

      resetBtn.addEventListener('pointerup', e => {
        e.preventDefault();
        if (_resetPressTimer !== null) {
          clearTimeout(_resetPressTimer);
          _resetPressTimer = null;
          showToast('Segure para reiniciar o jogo');
        }
      });

      resetBtn.addEventListener('pointercancel', () => {
        if (_resetPressTimer !== null) { clearTimeout(_resetPressTimer); _resetPressTimer = null; }
      });
    }

    // ── Ajuda: abre o manual oficial do Coup ──────────────────────────────────
    document.getElementById('coupHelpBtn')?.addEventListener('click', () => {
      window.open('https://www.fclar.unesp.br/Home/Biblioteca/jogos-coup-manual.pdf', '_blank');
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
    _lastState  = state;

    const me = state.players.find(p => p.playerId === _myPlayerId);
    const coins = me ? me.coins : 0;

    setText('coupTopNum',    coins);
    setText('coupBottomNum', coins);
    setText('coupBankCount', state.bankCoins);
    setText('coupDeckCount', state.deckCount);

    renderOwnCards(me);
    renderExchange(state, me);

    if (state.status === 'finished') {
      showToast(`Fim de jogo! Vencedor: ${esc(state.winnerName)}`);
    }
  }

  // ── Own cards ─────────────────────────────────────────────────────────────────

  function renderOwnCards(me) {
    const el = document.getElementById('coupOwnCards');
    if (!el || !me) return;

    el.innerHTML = '';

    // Se o role de uma carta virada mudou, é uma nova carta (reset) — vira de volta
    me.influence.forEach((card, idx) => {
      if (_flippedCards.has(idx) && !card.revealed && _flippedRoles[idx] && _flippedRoles[idx] !== card.role) {
        _flippedCards.delete(idx);
        delete _flippedRoles[idx];
      }
    });

    me.influence.forEach((card, idx) => {
      // Permanently revealed cards always show face-up
      if (card.revealed) _flippedCards.add(idx);
      const isFlipped = _flippedCards.has(idx);

      const slot = document.createElement('div');
      slot.className = 'coup-card-slot' + (card.revealed ? ' is-revealed' : '');

      // Flip container
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
            _flippedCards.delete(idx);
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
          selected.has(i) ? selected.delete(i) : (selected.size < keepCount && selected.add(i));
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

  window.GameModule = { init, render, onError };
})();
