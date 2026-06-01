(function () {
  const CARD_COLORS = [
    '#7B5528', // marrom (padrão)
    '#2e7d6e', // verde-água
    '#6b3a7d', // roxo
    '#b5451b', // laranja-tijolo
    '#1a5f8a', // azul-petróleo
    '#7a6f1e', // amarelo-oliva
    '#4a2c6e', // índigo
    '#8a3252', // vinho
  ];

  let _el         = null;
  let _isHost     = false;
  let _sendAction = null;
  let _myPlayerId = null;

  function init(el, myPlayerId, myPlayerName, isHost) {
    _el         = el;
    _isHost     = !!isHost;
    _myPlayerId = myPlayerId;
    _el.innerHTML = '<div class="ito-app" id="itoApp"></div>';
  }

  function render(state, sendAction) {
    _sendAction = sendAction;
    const app = document.getElementById('itoApp');
    if (!app) return;

    const num = state.myNumber ?? '?';
    const playerIndex = (state.players || []).findIndex(p => p.playerId === _myPlayerId);
    const cardColor = CARD_COLORS[playerIndex >= 0 ? playerIndex % CARD_COLORS.length : 0];

    app.innerHTML = `
      <div class="ito-content">
        <div class="ito-toprow">
          <div class="ito-top-left">
            <button class="ito-img-btn" id="itoBackBtn">
              <img src="/assets/ito/Voltar.png" alt="Voltar">
            </button>
            ${_isHost ? `
            <button class="ito-img-btn" id="itoResetBtn">
              <img src="/assets/ito/Reiniciar.png" alt="Nova rodada">
            </button>` : ''}
          </div>
        </div>

        <div class="ito-theme-card">
          <div class="ito-theme-name">${esc(state.theme)}</div>
          <div class="ito-theme-scale">${esc(state.themeScale || '')}</div>
        </div>

        <div class="ito-cards-row">
          <div class="ito-number-card" style="background:${cardColor}">
            <div class="ito-card-front">
              <span class="ito-card-front-icon">?</span>
            </div>
            <div class="ito-card-back">
              <span class="ito-number">${num}</span>
            </div>
          </div>
        </div>

        <div class="ito-bottombar">
          <button class="ito-img-btn ito-reveal-btn" id="itoRevealBtn">
            <img src="/assets/ito/revelar.png" alt="Revelar">
          </button>
        </div>
      </div>
    `;

    document.getElementById('itoBackBtn')?.addEventListener('click', () => {
      window.location.href = '/';
    });

    const resetBtn = document.getElementById('itoResetBtn');
    if (resetBtn) {
      let holdTimer = null;
      let progressAnim = null;

      const startHold = () => {
        resetBtn.classList.add('ito-holding');
        holdTimer = setTimeout(() => {
          resetBtn.classList.remove('ito-holding');
          _sendAction({ type: 'next-round' });
        }, 2000);
      };

      const cancelHold = () => {
        clearTimeout(holdTimer);
        holdTimer = null;
        resetBtn.classList.remove('ito-holding');
      };

      resetBtn.addEventListener('pointerdown', startHold);
      resetBtn.addEventListener('pointerup', cancelHold);
      resetBtn.addEventListener('pointercancel', cancelHold);
      resetBtn.addEventListener('contextmenu', e => e.preventDefault());
    }

    // Revelar: flip 3D da carta
    let revealed = false;
    const card = app.querySelector('.ito-number-card');

    function toggleFlip() {
      revealed = !revealed;
      card.classList.toggle('is-flipped', revealed);
    }

    document.getElementById('itoRevealBtn')?.addEventListener('click', toggleFlip);
    card?.addEventListener('click', toggleFlip);
  }

  function onError() {}

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render, onError };
})();
