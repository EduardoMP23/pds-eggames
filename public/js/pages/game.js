// ── Hold-to-confirm: segura o botão por 2s para a ação ocorrer ──────────────
// Usado pelos módulos de jogo nos botões Voltar/Reiniciar (anti toque acidental).
window.holdToConfirm = function (el, onConfirm, ms) {
  if (!el) return;
  ms = ms || 2000;
  let timer = null;

  const setHeld = (held) => {
    el.classList.toggle('holding', held);
    el.style.transition = 'transform .15s ease, filter .15s ease';
    el.style.transform  = held ? 'scale(.85)' : '';
    el.style.filter     = held ? 'brightness(1.4)' : '';
  };

  const showHint = () => {
    const r = el.getBoundingClientRect();
    const hint = document.createElement('div');
    hint.textContent = 'Segure por 2s';
    hint.style.cssText = `
      position:fixed; left:${r.left + r.width / 2}px; top:${r.bottom + 8}px;
      transform:translateX(-50%); background:rgba(0,0,0,.8); color:#fff;
      font-size:12px; font-weight:600; font-family:sans-serif;
      padding:5px 12px; border-radius:999px; white-space:nowrap;
      z-index:99999; pointer-events:none; opacity:1; transition:opacity .3s ease .9s;
    `;
    document.body.appendChild(hint);
    requestAnimationFrame(() => { hint.style.opacity = '0'; });
    setTimeout(() => hint.remove(), 1300);
  };

  const cancel = (early) => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    setHeld(false);
    if (early) showHint();
  };

  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    setHeld(true);
    timer = setTimeout(() => {
      timer = null;
      setHeld(false);
      if (el.isConnected) onConfirm(); // botão destruído no meio do hold → cancela
    }, ms);
  });
  el.addEventListener('pointerup',     () => cancel(true));
  el.addEventListener('pointercancel', () => cancel(false));
};

(function () {
  const roomId       = window.location.pathname.split('/').pop();
  const myPlayerId   = sessionStorage.getItem('playerId');
  const myPlayerName = sessionStorage.getItem('playerName');

  const GAME_META = {
    hive:       { title: '🐝 Hive',        css: '/css/games/hive.css',       js: '/js/games/hive.js'       },
    coup:       { title: '👑 Coup',        css: '/css/games/coup.css',       js: '/js/games/coup.js'       },
    ito:        { title: '🎋 ITO',         css: '/css/games/ito.css',        js: '/js/games/ito.js'        },
    poker:      { title: '🃏 Poker',       css: '/css/games/poker.css',      js: '/js/games/poker.js'      },
    uno:        { title: '🎴 UNO',         css: '/css/games/uno.css',        js: '/js/games/uno.js'        },
    bingo:      { title: '🎱 Bingo',       css: '/css/games/bingo.css',      js: '/js/games/bingo.js'      },
    pioramigo:  { title: '😈 Pior Amigo',  css: '/css/games/pioramigo.css',  js: '/js/games/pioramigo.js'  },
    pife:       { title: '🃏 Pife',        css: '/css/games/pife.css',        js: '/js/games/pife.js'        },
  };

  let gameModule = null;
  let lastState  = null;
  let currentGameId = null;

  // ── Ajuda: pop-up "Como jogar" + botão temático por jogo ──────────────────
  const GESTURES = {
    tap:  { label: 'TOQUE',     color: '#39ff7a' },
    hold: { label: 'SEGURE',    color: '#ffb31f' },
    drag: { label: 'ARRASTE',   color: '#00f0ff' },
    dbl:  { label: '2× TOQUE',  color: '#ff2e88' },
  };

  // Ícone "?" no estilo dos botões com SVG de traço (uno/hive usam currentColor).
  const ICON_STROKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.3-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  // Ícone "?" preenchido para jogos cujos botões são imagens PNG (sem arte de ajuda).
  function iconFilled(size) {
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,.42)"/>
      <circle cx="24" cy="24" r="22" fill="none" stroke="#fff" stroke-width="2.5"/>
      <text x="24" y="33" text-anchor="middle" font-family="'Press Start 2P',monospace" font-size="20" fill="#fff">?</text></svg>`;
  }
  const FIXED_TR = 'position:fixed;z-index:9000;';

  const GAME_HELP = {
    pife: {
      btn: { mountSel: '#pfField', cls: 'pf-topbtn', html: '?', style: 'top:16px;right:14px;z-index:5000;' },
      actions: [
        { g: 'tap',  text: 'numa carta da mão para selecioná-la e mostrar o botão "Jogar".' },
        { g: 'tap',  text: 'em "Jogar" (com 10 cartas) para descartar a carta selecionada.' },
        { g: 'drag', text: 'uma carta para os lados para reorganizar a mão.' },
        { g: 'drag', text: 'uma carta até a mesa para descartá-la.' },
        { g: 'tap',  text: 'no monte para comprar uma carta.' },
        { g: 'drag', text: 'do monte para escolher onde a carta entra na mão.' },
        { g: 'tap',  text: 'no descarte para pegar a carta do topo.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s para sair ou reiniciar.' },
      ],
    },
    uno: {
      btn: { mountSel: '.uno-root', cls: 'iconbtn', html: ICON_STROKE, style: 'position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;z-index:600;' },
      actions: [
        { g: 'tap',  text: 'numa carta para selecioná-la e mostrar o botão "Jogar".' },
        { g: 'tap',  text: 'em "Jogar" para jogar a carta selecionada.' },
        { g: 'drag', text: 'uma carta para os lados para reorganizar a mão.' },
        { g: 'drag', text: 'uma carta até a mesa para jogá-la.' },
        { g: 'tap',  text: 'no monte para comprar uma carta.' },
        { g: 'drag', text: 'do monte para escolher onde a carta entra na mão.' },
        { g: 'tap',  text: 'no descarte para pegar a carta do topo.' },
        { g: 'tap',  text: 'as setas ‹ › para navegar quando a mão é grande.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s.' },
      ],
    },
    coup: {
      selfButton: true,
      rulesUrl: 'https://www.fclar.unesp.br/Home/Biblioteca/jogos-coup-manual.pdf',
      actions: [
        { g: 'tap',  text: 'no banco de moedas (centro) para pegar 1 moeda.' },
        { g: 'tap',  text: 'no seu contador de moedas para devolver 1 moeda.' },
        { g: 'tap',  text: 'no baralho para ver quantas cartas restam.' },
        { g: 'hold', text: 'o baralho para iniciar a troca (Embaixador).' },
        { g: 'tap',  text: 'nas suas cartas para virá-las e ver o personagem.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s.' },
      ],
    },
    hive: {
      btn: { mountSel: '#gameArea', cls: 'hive-top-btn', html: ICON_STROKE, style: FIXED_TR + 'top:12px;right:12px;' },
      actions: [
        { g: 'tap',  text: 'numa peça da bandeja lateral para selecioná-la.' },
        { g: 'tap',  text: 'num espaço destacado no tabuleiro para colocar ou mover.' },
        { g: 'tap',  text: 'na seta lateral para abrir/fechar a bandeja de peças.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s.' },
      ],
    },
    ito: {
      btn: { mountSel: '#gameArea', cls: 'ito-img-btn', html: iconFilled(40), style: FIXED_TR + 'top:12px;right:12px;' },
      actions: [
        { g: 'tap',  text: 'na sua carta (ou no botão revelar) para ver/ocultar seu número.' },
        { g: 'hold', text: 'Voltar para sair, ou Reiniciar para a próxima rodada.' },
      ],
    },
    poker: {
      btn: { mountSel: '#gameArea', cls: 'pk-topbtn', html: iconFilled(56), style: FIXED_TR + 'top:10px;right:10px;' },
      actions: [
        { g: 'tap',  text: 'em +1/+10/+100 para montar sua aposta.' },
        { g: 'tap',  text: 'em Confirmar para apostar ou Reset para zerar.' },
        { g: 'tap',  text: 'em Pass para passar, Pay para pagar e Próxima Mão para seguir.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s.' },
      ],
    },
    bingo: {
      btn: { mountSel: '.bingo-header-right', cls: 'bingo-btn-reset', html: '?', style: '' },
      actions: [
        { g: 'tap',  text: 'numa casa da cartela para marcar/desmarcar.' },
        { g: 'tap',  text: 'em "BINGO!" para anunciar quando completar.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s.' },
      ],
    },
    pioramigo: {
      btn: { mountSel: '#gameArea', cls: 'pa-back-btn', html: iconFilled(46), style: FIXED_TR + 'top:12px;right:12px;' },
      actions: [
        { g: 'drag', text: 'a carta para baixo (além do limite) para aceitá-la.' },
        { g: 'hold', text: 'Voltar/Reiniciar por 2s.' },
      ],
    },
  };

  function ghEnsureButton(gameId) {
    const cfg = GAME_HELP[gameId];
    if (!cfg || cfg.selfButton || !cfg.btn) return;       // coup já tem botão próprio
    const parent = document.querySelector(cfg.btn.mountSel) || document.getElementById('gameArea');
    if (!parent || parent.querySelector('#ghHelpBtn')) return;
    const b = document.createElement('button');
    b.id = 'ghHelpBtn';
    b.className = cfg.btn.cls;
    b.title = 'Ajuda';
    b.innerHTML = cfg.btn.html;
    if (cfg.btn.style) b.style.cssText = cfg.btn.style;
    b.addEventListener('click', () => window.GameHelp.open(gameId));
    parent.appendChild(b);
  }

  function ghOpen(gameId) {
    const cfg = GAME_HELP[gameId];
    if (!cfg) return;
    const list = document.getElementById('helpList');
    list.innerHTML = (cfg.actions || []).map(a => {
      const g = GESTURES[a.g] || { label: a.g, color: '#888' };
      return `<div class="help-row"><span class="help-tag" style="background:${g.color}">${g.label}</span><span class="help-text">${a.text}</span></div>`;
    }).join('');
    const rules = document.getElementById('helpRulesBtn');
    if (cfg.rulesUrl) { rules.href = cfg.rulesUrl; rules.style.display = ''; }
    else rules.style.display = 'none';
    document.getElementById('helpModal').classList.add('visible');
  }

  function ghClose() {
    document.getElementById('helpModal').classList.remove('visible');
  }

  window.GameHelp = { ensureButton: ghEnsureButton, open: ghOpen, close: ghClose };

  // Fechar: botão ✕, clique no backdrop e tecla Esc.
  document.getElementById('helpClose').addEventListener('click', ghClose);
  document.getElementById('helpModal').addEventListener('click', e => {
    if (e.target.id === 'helpModal') ghClose();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ghClose();
  });

  const socket = io();

  socket.emit('room:join', { roomId, playerName: myPlayerName || 'Jogador', playerId: myPlayerId });

  // On reconnect (Safari drops WS aggressively), re-register so the server updates
  // p.socketId and sends the current game state to the new socket.
  socket.io.on('reconnect', () => {
    socket.emit('room:join', { roomId, playerName: myPlayerName || 'Jogador', playerId: myPlayerId });
  });

  socket.on('room:joined', data => {
    if (data.status !== 'playing') window.location.href = `/lobby/${roomId}`;
    if (data.playerId) sessionStorage.setItem('playerId', data.playerId);
    sessionStorage.setItem('isHost', data.isHost ? '1' : '0');
  });

  socket.on('game:start', ({ gameId }) => {
    currentGameId = gameId;
    if (gameModule?.onReset) gameModule.onReset();
    // On reconnect the module is already loaded — skip re-downloading the script.
    // The game:state-update that follows will call render() with the current state.
    if (!gameModule) loadGame(gameId);
  });

  socket.on('game:reset', () => {
    if (gameModule?.onReset) gameModule.onReset();
  });

  socket.on('game:state-update', state => {
    lastState = state;
    if (gameModule?.render) gameModule.render(state, sendAction);
    if (currentGameId) window.GameHelp.ensureButton(currentGameId);
  });

  socket.on('game:action-error', ({ message }) => {
    if (gameModule?.onError) gameModule.onError(message);
  });

  socket.on('game:animate', data => {
    if (gameModule?.onAnimate) gameModule.onAnimate(data);
  });

  socket.on('game:over', ({ winner, winnerName, reason, teamWin }) => {
    showGameOver({ winnerName, reason, teamWin, roomId });
  });

  socket.on('game:back-to-lobby', () => {
    window.location.href = '/lobby/' + roomId;
  });

  // Saída individual (ex.: Uno): só este jogador deixa a partida
  socket.on('game:left', () => {
    window.location.href = '/';
  });

  function loadGame(gameId) {
    currentGameId = gameId;
    const meta = GAME_META[gameId] || GAME_META.hive;
    const v = Date.now();
    document.getElementById('gameCss').href = meta.css + '?v=' + v;

    const script  = document.createElement('script');
    script.src    = meta.js + '?v=' + v;
    script.onload = () => {
      gameModule = window.GameModule;
      if (gameModule?.init) {
        const isHost = sessionStorage.getItem('isHost') === '1';
        gameModule.init(document.getElementById('gameArea'), myPlayerId, myPlayerName, isHost);
      }
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('gameContainer').style.display = '';
      if (lastState && gameModule?.render) gameModule.render(lastState, sendAction);
      window.GameHelp.ensureButton(gameId);
    };
    document.head.appendChild(script);
  }

  function sendAction(action) {
    socket.emit('game:action', { roomId, action });
  }

  function showGameOver({ winnerName, reason, teamWin, roomId }) {
    const myName  = sessionStorage.getItem('playerName') || '';
    const isWin   = teamWin || (winnerName && winnerName.toUpperCase() === myName.toUpperCase());

    const modal   = document.getElementById('gameOverModal');
    const popup   = document.getElementById('goPopup');
    const title   = document.getElementById('goTitle');
    const divider = document.getElementById('goDivider');
    const wnBlock = document.getElementById('goWinnerBlock');
    const wnName  = document.getElementById('goWinnerName');
    const reas    = document.getElementById('goReason');

    title.textContent = isWin ? 'VITÓRIA!' : 'GAME OVER';
    title.className   = 'go-title ' + (isWin ? 'go-title--win' : 'go-title--lose');
    popup.className   = 'go-popup '  + (isWin ? 'go-popup--win' : 'go-popup--lose');
    divider.className = 'go-divider ' + (isWin ? 'go-divider--win' : 'go-divider--lose');

    if (winnerName && !teamWin) {
      wnBlock.style.display = '';
      wnName.textContent    = winnerName;
    } else if (teamWin) {
      wnBlock.style.display = '';
      document.querySelector('.go-winner-label').textContent = '🏆 TIME VENCEU!';
      wnName.textContent = winnerName || '';
    } else {
      wnBlock.style.display = 'none';
    }

    reas.textContent = reason || '';

    // Buttons
    document.getElementById('goPlayAgain').onclick = () => {
      window.location.href = '/lobby/' + roomId;
    };
    document.getElementById('goSelectGame').onclick = () => {
      window.location.href = '/';
    };

    modal.classList.add('visible');

    // Confetti for winners
    if (isWin) {
      const container = document.getElementById('goConfetti');
      container.innerHTML = '';
      const colors = ['#ff2e88','#00f0ff','#ffe600','#39ff7a','#b14aed','#ff7a1f'];
      for (let i = 0; i < 60; i++) {
        const s = document.createElement('span');
        const color = colors[i % colors.length];
        const size  = 6 + Math.floor(Math.random() * 6);
        s.style.cssText = [
          'left:'                + (Math.random() * 100) + '%',
          'background:'          + color,
          'width:'               + size + 'px',
          'height:'              + size + 'px',
          'animation-duration:'  + (3 + Math.random() * 3) + 's',
          'animation-delay:'     + (Math.random() * 3) + 's',
        ].join(';');
        container.appendChild(s);
      }
    }
  }

})();
