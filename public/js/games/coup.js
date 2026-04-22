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

  let _el          = null;
  let _myPlayerId  = null;
  let _sendAction  = null;
  let _lastState   = null;
  let _longPressTimer = null;

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init(el, myPlayerId) {
    _el         = el;
    _myPlayerId = myPlayerId;

    _el.innerHTML = `
      <div class="coup-layout">

        <!-- TOP: inverted coin counter (visible to opponents across table) -->
        <div class="coup-top-bar">
          <div class="coup-top-counter">
            <span class="coup-counter-num" id="coupTopNum">0</span>
            <img src="/assets/coup/moeda.png" class="coup-counter-coin" alt="moeda">
          </div>
        </div>

        <!-- CENTER: shared bank and deck -->
        <div class="coup-center">
          <div class="coup-bank-area">
            <img src="/assets/coup/monte-moedas.png" class="coup-pile-img" id="coupPileImg" alt="banco de moedas">
            <div class="coup-resource-count" id="coupBankCount">0</div>
          </div>
          <div class="coup-deck-area">
            <img src="/assets/coup/baralho.png" class="coup-deck-img" id="coupDeckImg" alt="baralho">
            <div class="coup-resource-count" id="coupDeckCount">0</div>
          </div>
        </div>

        <!-- BOTTOM: player's own cards and coin counter -->
        <div class="coup-bottom-bar">
          <div class="coup-own-cards" id="coupOwnCards"></div>
          <div class="coup-own-counter" id="coupOwnCounter">
            <img src="/assets/coup/moeda.png" class="coup-counter-coin" alt="moeda">
            <span class="coup-counter-num" id="coupBottomNum">0</span>
          </div>
        </div>

        <!-- Exchange overlay (ambassador action) -->
        <div class="coup-exchange-overlay" id="coupExchangeOverlay" style="display:none"></div>

        <!-- Card action modal -->
        <div class="coup-modal-overlay" id="coupModalOverlay" style="display:none">
          <div class="coup-modal" id="coupModal"></div>
        </div>

        <!-- Toast feedback -->
        <div class="coup-toast" id="coupToast"></div>

      </div>
    `;

    setupBankInteraction();
    setupDeckInteraction();
    setupCoinReturn();
  }

  // ── Interaction setup ─────────────────────────────────────────────────────────

  function setupBankInteraction() {
    const pile = document.getElementById('coupPileImg');
    if (!pile) return;
    pile.addEventListener('click', () => {
      _sendAction && _sendAction({ type: 'take-coin' });
    });
  }

  function setupCoinReturn() {
    const counter = document.getElementById('coupOwnCounter');
    if (!counter) return;
    counter.addEventListener('click', () => {
      _sendAction && _sendAction({ type: 'return-coin' });
    });
  }

  function setupDeckInteraction() {
    const deck = document.getElementById('coupDeckImg');
    if (!deck) return;

    // Prevent browser context menu on long press
    deck.addEventListener('contextmenu', e => e.preventDefault());

    function startPress(e) {
      e.preventDefault();
      _longPressTimer = setTimeout(() => {
        _longPressTimer = null;
        _sendAction && _sendAction({ type: 'ambassador-start' });
        showToast('Segurando o baralho...');
      }, 700);
    }

    function endPress(e) {
      e.preventDefault();
      if (_longPressTimer !== null) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
        // Short tap: show deck count
        if (_lastState) showToast(`${_lastState.deckCount} carta${_lastState.deckCount !== 1 ? 's' : ''} no baralho`);
      }
    }

    function cancelPress() {
      if (_longPressTimer !== null) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
      }
    }

    deck.addEventListener('touchstart',  startPress,  { passive: false });
    deck.addEventListener('touchend',    endPress,    { passive: false });
    deck.addEventListener('touchcancel', cancelPress);
    deck.addEventListener('mousedown',   startPress);
    deck.addEventListener('mouseup',     endPress);
    deck.addEventListener('mouseleave',  cancelPress);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function render(state, sendAction) {
    _sendAction = sendAction;
    _lastState  = state;

    const me = state.players.find(p => p.playerId === _myPlayerId);

    // Update counters
    const coins = me ? me.coins : 0;
    const topNum    = document.getElementById('coupTopNum');
    const bottomNum = document.getElementById('coupBottomNum');
    const bankCount = document.getElementById('coupBankCount');
    const deckCount = document.getElementById('coupDeckCount');

    if (topNum)    topNum.textContent    = coins;
    if (bottomNum) bottomNum.textContent = coins;
    if (bankCount) bankCount.textContent = state.bankCoins;
    if (deckCount) deckCount.textContent = state.deckCount;

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

    me.influence.forEach((card, idx) => {
      const slot = document.createElement('div');
      slot.className = 'coup-card-slot' + (card.revealed ? ' is-revealed' : '');

      const img = document.createElement('img');
      img.className = 'coup-card-img';
      img.alt       = ROLE_LABELS[card.role] || 'carta';

      if (card.revealed) {
        img.src = ROLE_IMAGES[card.role] || '/assets/coup/carta-verso.png';

        // Return-to-deck button
        const btn = document.createElement('button');
        btn.className   = 'coup-return-btn';
        btn.textContent = '↩';
        btn.title       = 'Devolver ao baralho';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          showReturnDialog(idx, card.role);
        });
        slot.appendChild(img);
        slot.appendChild(btn);
      } else {
        img.src = '/assets/coup/carta-verso.png';
        slot.addEventListener('click', () => showRevealDialog(idx, card.role));
        slot.appendChild(img);
      }

      el.appendChild(slot);
    });
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────────

  function showRevealDialog(cardIdx, role) {
    openModal(`
      <img src="${ROLE_IMAGES[role] || '/assets/coup/carta-verso.png'}"
           class="coup-modal-card-img" alt="${esc(ROLE_LABELS[role] || role)}">
      <div class="coup-modal-role">${esc(ROLE_LABELS[role] || role)}</div>
      <div class="coup-modal-btns">
        <button class="coup-modal-btn coup-modal-confirm" id="coupModalPrimary">Revelar</button>
        <button class="coup-modal-btn coup-modal-cancel"  id="coupModalSecondary">Cancelar</button>
      </div>
    `, () => {
      _sendAction && _sendAction({ type: 'reveal-card', cardIndex: cardIdx });
    });
  }

  function showReturnDialog(cardIdx, role) {
    openModal(`
      <img src="${ROLE_IMAGES[role] || '/assets/coup/carta-verso.png'}"
           class="coup-modal-card-img" alt="${esc(ROLE_LABELS[role] || role)}">
      <div class="coup-modal-role">${esc(ROLE_LABELS[role] || role)}</div>
      <p class="coup-modal-text">Devolver ao baralho e comprar nova carta?</p>
      <div class="coup-modal-btns">
        <button class="coup-modal-btn coup-modal-confirm" id="coupModalPrimary">Devolver</button>
        <button class="coup-modal-btn coup-modal-cancel"  id="coupModalSecondary">Cancelar</button>
      </div>
    `, () => {
      _sendAction && _sendAction({ type: 'return-card-to-deck', cardIndex: cardIdx });
    });
  }

  function openModal(html, onConfirm) {
    const overlay = document.getElementById('coupModalOverlay');
    const modal   = document.getElementById('coupModal');
    if (!overlay || !modal) return;

    modal.innerHTML = html;
    overlay.style.display = 'flex';

    document.getElementById('coupModalPrimary')?.addEventListener('click', () => {
      onConfirm();
      closeModal();
    });
    document.getElementById('coupModalSecondary')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); }, { once: true });
  }

  function closeModal() {
    const overlay = document.getElementById('coupModalOverlay');
    if (overlay) overlay.style.display = 'none';
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
          }
          draw();
        });
      });

      const confirmBtn = document.getElementById('coupExConfirm');
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.addEventListener('click', () => {
          _sendAction && _sendAction({ type: 'ambassador-choose', keep: [...selected] });
        });
      }
    };

    draw();
  }

  // ── Error / toast ─────────────────────────────────────────────────────────────

  function onError(message) {
    showToast(message);
  }

  function showToast(msg) {
    const toast = document.getElementById('coupToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.GameModule = { init, render, onError };
})();
