(function () {
  'use strict';

  let _el            = null;
  let _myPlayerId    = null;
  let _isHost        = false;
  let _sendAction    = null;
  let _lastState     = null;
  let _markedCells   = new Set();  // grid indices 0-24 marked by player (client-only)
  let _checkingBingo = false;      // blocks render while call-bingo animation plays
  let _pendingState  = null;       // state queued during checking animation
  let _ballAnimating = false;      // prevents overlapping ball animations
  let _toastTimer    = null;

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(el, myPlayerId, myPlayerName, isHost) {
    _el         = el;
    _myPlayerId = myPlayerId;
    _isHost     = !!isHost;

    _el.innerHTML = `
      <div class="bingo-layout">
        <div class="bingo-header">
          <div class="bingo-header-left">
            <button class="bingo-btn-back" id="bingoBtnBack" title="Voltar ao lobby">&#8592;</button>
            <span class="bingo-title">BINGO</span>
          </div>
          <div class="bingo-header-right">
            <span class="bingo-pool-counter" id="bingoPoolCounter"></span>
            <button class="bingo-btn-reset" id="bingoBtnReset" title="Reiniciar jogo" style="display:none">&#8635;</button>
          </div>
        </div>
        <div class="bingo-drawn-bar" id="bingoDrawnBar"></div>
        <div class="bingo-ball-stage" id="bingoBallStage"></div>
        <div class="bingo-card-wrap">
          <div class="bingo-card" id="bingoCard"></div>
        </div>
        <div class="bingo-footer">
          <button class="bingo-btn-call" id="bingoBtnCall">&#127922; BINGO!</button>
        </div>
        <div class="bingo-overlay" id="bingoOverlay" style="display:none">
          <div class="bingo-overlay-icon">&#127922;</div>
          <div class="bingo-overlay-msg" id="bingoOverlayMsg">Verificando...</div>
        </div>
        <div class="bingo-toast" id="bingoToast"></div>
      </div>
    `;

    window.holdToConfirm(document.getElementById('bingoBtnBack'), () => {
      if (_sendAction) _sendAction({ type: 'leave' });
      // fallback: se o servidor não responder com game:left, navega mesmo assim
      setTimeout(() => { window.location.href = '/'; }, 1000);
    });

    window.holdToConfirm(document.getElementById('bingoBtnReset'), () => {
      if (_sendAction) _sendAction({ type: 'reset' });
    });

    document.getElementById('bingoBtnCall').addEventListener('click', () => {
      if (_sendAction) _sendAction({ type: 'call-bingo' });
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(state, sendAction) {
    _sendAction = sendAction;

    // Animation gate — same pattern as Coup's _exchangeAnimating
    if (_checkingBingo) {
      _pendingState = state;
      return;
    }

    const prev = _lastState;

    // Detect new number drawn → trigger ball animation
    if (
      !_ballAnimating &&
      state.currentNumber !== null &&
      state.currentNumber !== (prev ? prev.currentNumber : null)
    ) {
      _ballAnimating = true;
      _animateBall(state.currentNumber, () => {
        _ballAnimating = false;
        _lastState = state;
        _renderCard(state);
        _renderDrawnBar(state);
        _updateControls(state);
      });
      return; // defer full DOM update until animation completes
    }

    // Show invalidBingo toast when it transitions to a non-null value
    if (
      state.invalidBingo &&
      (!prev || !prev.invalidBingo || prev.invalidBingo.playerId !== state.invalidBingo.playerId)
    ) {
      _showToast('Cartela inválida! O jogo continua.');
    }

    _lastState = state;
    _renderCard(state);
    _renderDrawnBar(state);
    _updateControls(state);
  }

  // ── Card Rendering ─────────────────────────────────────────────────────────
  function _renderCard(state) {
    const card = document.getElementById('bingoCard');
    if (!card) return;

    const drawnSet = new Set(state.drawnNumbers);
    const frag    = document.createDocumentFragment();

    for (let gi = 0; gi < 25; gi++) {
      const cell = document.createElement('div');
      cell.className = 'bingo-cell';

      if (gi === 12) {
        cell.classList.add('bingo-cell--free');
        cell.textContent = 'BINGO';
      } else {
        const ci  = gi < 12 ? gi : gi - 1;
        const num = state.myCard[ci];
        cell.textContent = num;
        cell.dataset.gi  = gi;

        const isDrawn  = drawnSet.has(num);
        const isMarked = _markedCells.has(gi);

        if (isMarked && isDrawn) {
          cell.classList.add('bingo-cell--hit');
        } else if (isMarked) {
          cell.classList.add('bingo-cell--marked');
        }

        cell.addEventListener('click', () => _toggleMark(gi, state));
      }

      frag.appendChild(cell);
    }

    card.innerHTML = '';
    card.appendChild(frag);
  }

  function _toggleMark(gi, state) {
    if (_markedCells.has(gi)) {
      _markedCells.delete(gi);
    } else {
      _markedCells.add(gi);
    }
    _renderCard(state);
  }

  // ── Drawn Numbers Bar ──────────────────────────────────────────────────────
  function _renderDrawnBar(state) {
    const bar = document.getElementById('bingoDrawnBar');
    if (!bar) return;
    const frag = document.createDocumentFragment();

    state.drawnNumbers.forEach((n, idx) => {
      const chip = document.createElement('span');
      chip.className = 'bingo-drawn-chip';
      if (idx === state.drawnNumbers.length - 1) chip.classList.add('bingo-drawn-chip--latest');
      chip.textContent = n;
      frag.appendChild(chip);
    });

    bar.innerHTML = '';
    bar.appendChild(frag);
    bar.scrollLeft = bar.scrollWidth;
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function _updateControls(state) {
    const callBtn   = document.getElementById('bingoBtnCall');
    const resetBtn  = document.getElementById('bingoBtnReset');
    const poolCtr   = document.getElementById('bingoPoolCounter');

    if (callBtn) {
      callBtn.disabled = state.status !== 'playing';
    }
    if (resetBtn) {
      resetBtn.style.display = _isHost ? '' : 'none';
    }
    if (poolCtr) {
      poolCtr.textContent = state.poolRemaining > 0
        ? `${state.poolRemaining} restantes`
        : 'Esgotado';
    }
  }

  // ── Ball Animation ─────────────────────────────────────────────────────────
  function _animateBall(number, onComplete) {
    const stage = document.getElementById('bingoBallStage');
    if (!stage) { onComplete(); return; }

    stage.innerHTML = `
      <div class="bingo-ball bingo-ball--appear" id="bingoBallEl">
        <span class="bingo-ball-num">${number}</span>
      </div>
    `;

    const ball = document.getElementById('bingoBallEl');

    // Trava estado visível após a animação de aparecer
    setTimeout(() => {
      if (ball) ball.classList.add('bingo-ball--stop');
    }, 380);

    // Após 5s estático, voa para cima em direção à barra de sorteados
    setTimeout(() => {
      if (ball) ball.classList.add('bingo-ball--fly-up');
      setTimeout(() => {
        if (stage) stage.innerHTML = '';
        onComplete();
      }, 500);
    }, 6400);
  }

  // ── Checking Overlay ───────────────────────────────────────────────────────
  function _showOverlay(msg) {
    const overlay = document.getElementById('bingoOverlay');
    const msgEl   = document.getElementById('bingoOverlayMsg');
    if (overlay) overlay.style.display = 'flex';
    if (msgEl)   msgEl.textContent = msg;
  }

  function _hideOverlay() {
    const overlay = document.getElementById('bingoOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function _showToast(msg) {
    const toast = document.getElementById('bingoToast');
    if (!toast) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    toast.textContent = msg;
    toast.classList.add('visible');
    _toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  // ── onAnimate ──────────────────────────────────────────────────────────────
  function onAnimate(data) {
    if (data.type !== 'call-bingo') return;

    const name = data.playerName || data.playerId || 'um jogador';
    _checkingBingo = true;
    _showOverlay(`Verificando cartela de ${_esc(name)}...`);

    setTimeout(() => {
      _hideOverlay();
      _checkingBingo = false;
      const queued = _pendingState;
      _pendingState = null;
      if (queued) render(queued, _sendAction);
    }, 3000);
  }

  // ── onError ────────────────────────────────────────────────────────────────
  function onError(msg) {
    _showToast(msg || 'Erro desconhecido');
  }

  // ── onReset ────────────────────────────────────────────────────────────────
  function onReset() {
    _markedCells.clear();
    _checkingBingo = false;
    _pendingState  = null;
    _ballAnimating = false;
    _lastState     = null;
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.GameModule = { init, render, onError, onAnimate, onReset };
})();
