(function () {
  'use strict';

  const SUIT_UNICODE = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const RANK_DISPLAY = { T: '10' };
  const IS_RED       = { h: true, d: true };

  const SEAT_KEYS = ['t1','t2','t3','t4','l1','l2','r1','r2'];

  let _el, _myPlayerId, _sendAction, _lastState, _fitFn;
  let _raiseAmount = 0;

  // ── Init ──────────────────────────────────────────────────────────────────

  function init(el, myPlayerId) {
    if (_fitFn) window.removeEventListener('resize', _fitFn);

    _el          = el;
    _myPlayerId  = myPlayerId;
    _raiseAmount = 0;
    _lastState   = null;

    _el.innerHTML = buildHTML();
    attachEvents();

    _fitFn = function fit() {
      const stage = qs('#pk-stage');
      if (!stage) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / 1218, h / 784);
      stage.style.transform = `scale(${s})`;
    };
    window.addEventListener('resize', _fitFn);
    _fitFn();
  }

  // ── HTML scaffold ─────────────────────────────────────────────────────────

  function buildHTML() {
    const seats = SEAT_KEYS.map((k, i) =>
      `<div class="pk-seat pk-s-${k}" id="pk-seat-${i}"></div>`
    ).join('');

    const commCards = [0,1,2,3,4].map(i =>
      `<div class="pk-card back" id="pk-comm-${i}"></div>`
    ).join('');

    return `
      <div id="pk-portrait-warning">
        📱 Gire o dispositivo para o modo paisagem
      </div>

      <div id="pk-bg">
        <div id="pk-stage">

          <!-- Navegação -->
          <button class="pk-topbtn" id="pk-back-btn" title="Voltar">
            <img src="/assets/poker/Voltar.png" alt="Voltar">
          </button>
          <button class="pk-topbtn" id="pk-restart-btn" title="Reiniciar" style="display:none">
            <img src="/assets/poker/Reiniciar.png" alt="Reiniciar">
          </button>

          <!-- Mesa -->
          <div class="pk-table"><div class="pk-felt"></div></div>

          <!-- Pote -->
          <div id="pk-pot">R$ 0</div>

          <!-- Fase / vencedor -->
          <div id="pk-phase-label"></div>
          <div id="pk-winner-label" style="display:none"></div>

          <!-- Cartas comunitárias -->
          <div id="pk-board">${commCards}</div>

          <!-- Assentos dos oponentes -->
          ${seats}

          <!-- Mão do jogador -->
          <div id="pk-hand">
            <div class="pk-card back" id="pk-hole-0"></div>
            <div class="pk-card back" id="pk-hole-1"></div>
          </div>

          <!-- Info do jogador (fichas + aposta atual) -->
          <div id="pk-my-info">
            <div id="pk-my-chips">R$ 0</div>
            <div id="pk-my-bet-label"></div>
          </div>

          <!-- Botão Pass / Check / Fold -->
          <button id="pk-pass-btn" disabled>Pass</button>

          <!-- Botão Pay / Call -->
          <button id="pk-pay-btn" style="display:none" disabled>Pay</button>

          <!-- Display de aposta -->
          <div id="pk-betbox">
            <div id="pk-pot-label">R$ 0</div>
            <div id="pk-raise-label">R$ 0</div>
          </div>

          <!-- Fichas de incremento -->
          <button class="pk-chip pk-dark"  id="pk-btn-1"   disabled>+1</button>
          <button class="pk-chip pk-dark"  id="pk-btn-10"  disabled>+10</button>
          <button class="pk-chip pk-dark"  id="pk-btn-100" disabled>+100</button>
          <button class="pk-chip pk-light" id="pk-reset-btn"   disabled>Reset</button>
          <button class="pk-chip pk-light" id="pk-confirm-btn" disabled>Confirm</button>

          <!-- Próxima mão -->
          <button id="pk-next-hand-btn" style="display:none">Próxima Mão</button>

        </div>
      </div>
    `;
  }

  // ── Card helpers ──────────────────────────────────────────────────────────

  function applyCard(el, card) {
    if (!card) {
      el.className = 'pk-card back';
      el.innerHTML = '';
      return;
    }
    const suit     = SUIT_UNICODE[card.suit];
    const rank     = RANK_DISPLAY[card.rank] || card.rank;
    const colorCls = IS_RED[card.suit] ? 'red' : 'dark';
    el.className   = `pk-card ${colorCls}`;
    el.innerHTML   = `<span class="pk-suit">${suit}</span><span class="pk-rank">${rank}</span>`;
  }

  function cardHTML(card) {
    if (!card) return `<div class="pk-card back"></div>`;
    const suit     = SUIT_UNICODE[card.suit];
    const rank     = RANK_DISPLAY[card.rank] || card.rank;
    const colorCls = IS_RED[card.suit] ? 'red' : 'dark';
    return `<div class="pk-card ${colorCls}">
      <span class="pk-suit">${suit}</span>
      <span class="pk-rank">${rank}</span>
    </div>`;
  }

  // ── Seat widget ───────────────────────────────────────────────────────────

  function seatHTML(p, isDealer, isCurrentTurn) {
    let betText = '';
    if (p.eliminated)  betText = 'Eliminado';
    else if (p.folded) betText = 'Fold';
    else if (p.allIn)  betText = 'All-In';
    else if (p.bet > 0) betText = `+R$ ${p.bet}`;

    const stateCls = p.eliminated ? 'eliminated'
      : p.folded ? 'folded'
      : isCurrentTurn ? 'is-turn'
      : '';

    return `
      <div class="pk-seat-inner ${stateCls}">
        <div class="pk-seat-sprite">
          ${isDealer ? '<div class="pk-dealer-dot">D</div>' : ''}
          <img src="/assets/poker/divers%C3%A1rio.png" class="pk-sprite-bg" alt="">
          <span class="pk-sprite-name">${escHtml(p.playerName)}</span>
          <span class="pk-sprite-chips">R$ ${p.chips}</span>
          <span class="pk-sprite-bet">${betText}</span>
        </div>
      </div>
    `;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render(state, sendAction) {
    _sendAction = sendAction;
    _lastState  = state;

    const me        = state.players.find(p => p.playerId === _myPlayerId);
    const opponents = state.players.filter(p => p.playerId !== _myPlayerId);
    const isMyTurn  = state.phase !== 'showdown' &&
      state.players[state.currentPlayerIndex]?.playerId === _myPlayerId &&
      !me?.folded && !me?.eliminated && !me?.allIn;

    // ── Assentos ───────────────────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const seatEl = qs(`#pk-seat-${i}`);
      if (!seatEl) continue;
      const opp    = opponents[i];
      if (opp) {
        const pidx     = state.players.findIndex(x => x.playerId === opp.playerId);
        const isDealer = state.dealerIndex === pidx;
        const isTurn   = state.players[state.currentPlayerIndex]?.playerId === opp.playerId;
        seatEl.className = `pk-seat pk-s-${SEAT_KEYS[i]}`;
        seatEl.innerHTML = seatHTML(opp, isDealer, isTurn);
      } else {
        seatEl.className = `pk-seat pk-s-${SEAT_KEYS[i]}`;
        seatEl.innerHTML = '';
      }
    }

    // ── Cartas comunitárias ────────────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      applyCard(qs(`#pk-comm-${i}`), state.communityCards[i] || null);
    }

    // ── Pote ──────────────────────────────────────────────────────────────
    qs('#pk-pot').textContent = `R$ ${state.pot}`;

    // ── Fase ──────────────────────────────────────────────────────────────
    const phaseNames = {
      preflop:'Pré-Flop', flop:'Flop',
      turn:'Turn', river:'River', showdown:'Showdown',
    };
    qs('#pk-phase-label').textContent = phaseNames[state.phase] || '';

    // ── Vencedor ──────────────────────────────────────────────────────────
    const wl = qs('#pk-winner-label');
    if (state.phase === 'showdown' && state.lastWinnerNames) {
      wl.style.display = 'block';
      const hand = state.lastWinningHand ? ` (${state.lastWinningHand})` : '';
      wl.textContent = `${state.lastWinnerNames.join(' & ')} vence${hand}`;
    } else {
      wl.style.display = 'none';
    }

    // ── Minhas cartas ──────────────────────────────────────────────────────
    if (me?.hand) {
      applyCard(qs('#pk-hole-0'), me.hand[0] || null);
      applyCard(qs('#pk-hole-1'), me.hand[1] || null);
    }

    // ── Minha info ─────────────────────────────────────────────────────────
    qs('#pk-my-chips').textContent     = `R$ ${me?.chips ?? 0}`;
    qs('#pk-my-bet-label').textContent = me?.bet > 0 ? `+R$ ${me.bet}` : '';

    // ── Display de aposta ─────────────────────────────────────────────────
    qs('#pk-pot-label').textContent   = `R$ ${state.currentBet}`;
    qs('#pk-raise-label').textContent = `R$ ${_raiseAmount}`;

    // ── Botões de ação ─────────────────────────────────────────────────────
    const passBtn    = qs('#pk-pass-btn');
    const payBtn     = qs('#pk-pay-btn');
    const confirmBtn = qs('#pk-confirm-btn');
    const hasBetToCall = me && me.bet < state.currentBet;

    if (isMyTurn) {
      passBtn.disabled    = false;
      passBtn.textContent = hasBetToCall ? 'Fold' : 'Pass';
      payBtn.style.display = hasBetToCall ? '' : 'none';
      payBtn.disabled = false;
      qs('#pk-btn-1').disabled   = false;
      qs('#pk-btn-10').disabled  = false;
      qs('#pk-btn-100').disabled = false;
      qs('#pk-reset-btn').disabled   = false;
      confirmBtn.disabled = _raiseAmount <= 0;
    } else {
      passBtn.disabled     = true;
      payBtn.style.display = 'none';
      qs('#pk-btn-1').disabled   = true;
      qs('#pk-btn-10').disabled  = true;
      qs('#pk-btn-100').disabled = true;
      qs('#pk-reset-btn').disabled   = true;
      confirmBtn.disabled = true;
    }

    // ── Próxima mão ───────────────────────────────────────────────────────
    qs('#pk-next-hand-btn').style.display =
      state.phase === 'showdown' && state.status !== 'finished' ? '' : 'none';

    // ── Reiniciar (host) ──────────────────────────────────────────────────
    qs('#pk-restart-btn').style.display =
      state.hostPlayerId === _myPlayerId ? '' : 'none';
  }

  // ── Eventos ───────────────────────────────────────────────────────────────

  function attachEvents() {
    qs('#pk-back-btn').addEventListener('click', () => {
      _sendAction?.({ type: 'leave' });
    });

    qs('#pk-restart-btn').addEventListener('click', () => {
      _sendAction?.({ type: 'reset' });
    });

    qs('#pk-pass-btn').addEventListener('click', () => {
      if (!_lastState) return;
      const me = _lastState.players.find(p => p.playerId === _myPlayerId);
      _sendAction?.({ type: me?.bet < _lastState.currentBet ? 'fold' : 'check' });
    });

    qs('#pk-pay-btn').addEventListener('click', () => {
      _sendAction?.({ type: 'call' });
    });

    qs('#pk-btn-1').addEventListener('click',   () => { _raiseAmount += 1;   updateRaise(); });
    qs('#pk-btn-10').addEventListener('click',  () => { _raiseAmount += 10;  updateRaise(); });
    qs('#pk-btn-100').addEventListener('click', () => { _raiseAmount += 100; updateRaise(); });

    qs('#pk-reset-btn').addEventListener('click', () => {
      _raiseAmount = 0;
      updateRaise();
    });

    qs('#pk-confirm-btn').addEventListener('click', () => {
      if (_raiseAmount > 0) {
        _sendAction?.({ type: 'raise', amount: _raiseAmount });
        _raiseAmount = 0;
        updateRaise();
      }
    });

    qs('#pk-next-hand-btn').addEventListener('click', () => {
      _sendAction?.({ type: 'next-hand' });
    });
  }

  function updateRaise() {
    const el = qs('#pk-raise-label');
    if (el) el.textContent = `R$ ${_raiseAmount}`;
    const btn = qs('#pk-confirm-btn');
    if (btn) btn.disabled = _raiseAmount <= 0;
  }

  // ── Hooks ─────────────────────────────────────────────────────────────────

  function onError(message) {
    const t = document.createElement('div');
    t.className = 'pk-toast';
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function onAnimate(data) {
    if (data?.type === 'win' && _lastState?.lastWinners) {
      _lastState.lastWinners.forEach(pid => {
        // highlight both the seat widget and the pot label
        const seat = _el?.querySelector(`[data-pid="${pid}"]`);
        if (seat) {
          seat.style.transition = 'filter .3s';
          seat.style.filter = 'drop-shadow(0 0 14px #f1c40f)';
          setTimeout(() => { seat.style.filter = ''; }, 2000);
        }
      });
    }
  }

  function onReset() {
    _raiseAmount = 0;
    _lastState   = null;
  }

  // ── Util ──────────────────────────────────────────────────────────────────

  function qs(selector) {
    return (_el || document).querySelector(selector);
  }

  window.GameModule = { init, render, onError, onAnimate, onReset };
})();
