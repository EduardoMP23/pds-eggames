(function () {
  const roomId = window.location.pathname.split('/').pop();
  const myPlayerId = sessionStorage.getItem('playerId');
  const myPlayerName = sessionStorage.getItem('playerName');

  let gameId = null;
  let gameModule = null;
  let lastState = null;

  const socket = io();

  const gameLabels = {
    chess: '♟️ Xadrez',
    explodingKittens: '💣 Exploding Kittens',
    coup: '👑 Coup',
    hive: '🐝 Hive'
  };

  const gameModuleMap = {
    chess: '/js/games/chess.js',
    explodingKittens: '/js/games/exploding-kittens.js',
    coup: '/js/games/coup.js',
    hive: '/js/games/hive.js'
  };

  const gameCssMap = {
    chess: '/css/games/chess.css',
    explodingKittens: '/css/games/exploding-kittens.css',
    coup: '/css/games/coup.css',
    hive: '/css/games/hive.css'
  };

  // If already started, rejoin
  socket.emit('room:join', { roomId, playerName: myPlayerName || 'Jogador' });

  socket.on('room:joined', (data) => {
    if (data.status !== 'playing') {
      window.location.href = `/lobby/${roomId}`;
    }
    // Update playerId if assigned fresh
    if (data.playerId) sessionStorage.setItem('playerId', data.playerId);
  });

  socket.on('game:start', ({ gameId: gid }) => {
    loadGame(gid);
  });

  socket.on('game:state-update', (state) => {
    lastState = state;
    if (gameModule && gameModule.render) {
      gameModule.render(state, sendAction);
      updateTurnIndicator(state);
    }
  });

  socket.on('game:events', ({ events }) => {
    events.forEach(addEventLog);
  });

  socket.on('game:over', ({ winner, winnerName, reason }) => {
    const isWinner = winner === myPlayerId;
    document.getElementById('gameOverTitle').textContent = isWinner ? '🏆 Você Venceu!' : '😢 Fim de Jogo';
    document.getElementById('gameOverMsg').textContent =
      winner ? `${winnerName} venceu!` + (reason ? ` (${reason})` : '') : `Empate${reason ? ' por ' + reason : ''}!`;
    document.getElementById('gameOverModal').style.display = 'flex';
  });

  socket.on('game:action-error', ({ message }) => {
    addEventLog(`❌ ${message}`);
  });

  socket.on('chat:message', ({ playerName, text }) => {
    const msgs = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="author">${esc(playerName)}:</span> ${esc(text)}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  });

  function loadGame(gid) {
    gameId = gid;
    document.getElementById('gameTitle').textContent = gameLabels[gid] || gid;
    document.getElementById('gameCss').href = gameCssMap[gid] || '';

    const script = document.createElement('script');
    script.src = gameModuleMap[gid];
    script.onload = () => {
      gameModule = window.GameModule;
      if (gameModule && gameModule.init) {
        gameModule.init(document.getElementById('gameArea'), myPlayerId, myPlayerName);
      }
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('gameContainer').style.display = '';
      if (lastState && gameModule && gameModule.render) {
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
    if (state.isMyTurn) {
      el.textContent = '🟢 Sua vez!';
    } else {
      el.textContent = 'Aguardando...';
    }
  }

  function addEventLog(msg) {
    const log = document.getElementById('eventLog');
    const div = document.createElement('div');
    div.className = 'entry';
    div.textContent = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  window.sendChat = function () {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat:message', { roomId, text });
    input.value = '';
  };

  window.chatKeyDown = function (e) {
    if (e.key === 'Enter') window.sendChat();
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
