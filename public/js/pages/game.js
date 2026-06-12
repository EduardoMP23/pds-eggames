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
