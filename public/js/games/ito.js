(function () {
  let _el         = null;
  let _isHost     = false;
  let _sendAction = null;

  function init(el, myPlayerId, myPlayerName, isHost) {
    _el     = el;
    _isHost = !!isHost;
    _el.innerHTML = '<div class="ito-app" id="itoApp"></div>';
  }

  function render(state, sendAction) {
    _sendAction = sendAction;
    const app = document.getElementById('itoApp');
    if (!app) return;

    const num = state.myNumber ?? '?';

    app.innerHTML = `
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
        <div class="ito-number-card">
          <span class="ito-number">${num}</span>
        </div>
      </div>

      <div class="ito-bottombar">
        <button class="ito-img-btn ito-reveal-btn" id="itoRevealBtn">
          <img src="/assets/ito/revelar.png" alt="Revelar">
        </button>
      </div>
    `;

    document.getElementById('itoBackBtn')?.addEventListener('click', () => {
      window.location.href = '/';
    });

    document.getElementById('itoResetBtn')?.addEventListener('click', () => {
      _sendAction({ type: 'next-round' });
    });

    // Revelar: mostra/esconde o número (toggle)
    let hidden = false;
    const card = app.querySelector('.ito-number-card');
    document.getElementById('itoRevealBtn')?.addEventListener('click', () => {
      hidden = !hidden;
      card.classList.toggle('ito-number-hidden', hidden);
    });
  }

  function onError() {}

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render, onError };
})();
