(function () {
  const roomId       = window.location.pathname.split('/').pop();
  const myPlayerId   = sessionStorage.getItem('playerId');
  const myPlayerName = sessionStorage.getItem('playerName');

  const GAME_META = {
    hive: { title: '🐝 Hive', css: '/css/games/hive.css', js: '/js/games/hive.js' },
    coup: { title: '👑 Coup', css: '/css/games/coup.css', js: '/js/games/coup.js' },
    ito:  { title: '🎋 ITO',  css: '/css/games/ito.css',  js: '/js/games/ito.js'  },
  };

  let gameModule = null;
  let lastState  = null;

  const socket = io();

  socket.emit('room:join', { roomId, playerName: myPlayerName || 'Jogador' });

  socket.on('room:joined', data => {
    if (data.status !== 'playing') window.location.href = `/lobby/${roomId}`;
    if (data.playerId) sessionStorage.setItem('playerId', data.playerId);
    sessionStorage.setItem('isHost', data.isHost ? '1' : '0');
  });

  socket.on('game:start', ({ gameId }) => loadGame(gameId));

  socket.on('game:state-update', state => {
    lastState = state;
    if (gameModule?.render) {
      gameModule.render(state, sendAction);
      updateTurnIndicator(state);
    }
  });

  socket.on('game:action-error', ({ message }) => {
    if (gameModule?.onError) gameModule.onError(message);
  });

  socket.on('game:over', ({ winner, winnerName, reason, teamWin }) => {
    let title, msg;
    if (teamWin) {
      title = '🏆 Time Venceu!';
      msg   = reason || 'Parabéns, vocês completaram o desafio!';
    } else if (winner && winner !== 'team') {
      const isWinner = winner === myPlayerId;
      title = isWinner ? '🏆 Você Venceu!' : '😢 Fim de Jogo';
      msg   = `${winnerName} venceu!${reason ? ` (${reason})` : ''}`;
    } else {
      title = '😢 Fim de Jogo';
      msg   = reason || 'O time perdeu.';
    }
    document.getElementById('gameOverTitle').textContent = title;
    document.getElementById('gameOverMsg').textContent   = msg;
    document.getElementById('gameOverModal').style.display = 'flex';
  });

  function loadGame(gameId) {
    const meta = GAME_META[gameId] || GAME_META.hive;
    document.getElementById('gameTitle').textContent = meta.title;
    document.getElementById('gameCss').href = meta.css;

    const script  = document.createElement('script');
    script.src    = meta.js;
    script.onload = () => {
      gameModule = window.GameModule;
      if (gameModule?.init) {
        const isHost = sessionStorage.getItem('isHost') === '1';
        gameModule.init(document.getElementById('gameArea'), myPlayerId, myPlayerName, isHost);
      }
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('gameContainer').style.display = '';
      if (lastState && gameModule?.render) {
        gameModule.render(lastState, sendAction);
        updateTurnIndicator(lastState);
      }
    };
    document.head.appendChild(script);
  }

  function sendAction(action) {
    socket.emit('game:action', { roomId, action });
  }

  function updateTurnIndicator(state) {
    const el = document.getElementById('turnIndicator');
    if (!el) return;
    // ITO — cooperative indicator
    if (state.phase === 'describing') {
      el.textContent = state.iAmDescribed ? '✅ Descrição enviada' : '✏️ Descreva suas cartas';
    } else if (state.phase === 'ordering') {
      el.textContent = '🔀 Ordenem as cartas';
    } else if (state.phase === 'round-result') {
      el.textContent = state.roundSuccess ? '✅ Rodada vencida!' : '❌ Rodada perdida';
    // Coup / Hive indicators
    } else if (state.myTurn) {
      el.textContent = '🟢 Sua vez!';
    } else if (state.iAmAwaiting) {
      el.textContent = '⚡ Reagir';
    } else if (state.mustLoseInfluence) {
      el.textContent = '💀 Escolha uma carta';
    } else {
      el.textContent = 'Aguardando...';
    }
  }
})();
