(function () {
  const roomId       = window.location.pathname.split('/').pop();
  const myPlayerId   = sessionStorage.getItem('playerId');
  const myPlayerName = sessionStorage.getItem('playerName');

  let gameModule = null;
  let lastState  = null;

  const socket = io();

  socket.emit('room:join', { roomId, playerName: myPlayerName || 'Jogador' });

  socket.on('room:joined', data => {
    if (data.status !== 'playing') window.location.href = `/lobby/${roomId}`;
    if (data.playerId) sessionStorage.setItem('playerId', data.playerId);
  });

  socket.on('game:start', () => loadGame());

  socket.on('game:state-update', state => {
    lastState = state;
    if (gameModule?.render) {
      gameModule.render(state, sendAction);
      updateTurnIndicator(state);
    }
  });

  socket.on('game:over', ({ winner, winnerName, reason }) => {
    const isWinner = winner === myPlayerId;
    document.getElementById('gameOverTitle').textContent = isWinner ? '🏆 Você Venceu!' : '😢 Fim de Jogo';
    document.getElementById('gameOverMsg').textContent =
      winner
        ? `${winnerName} venceu!${reason ? ` (${reason})` : ''}`
        : `Empate${reason ? ' por ' + reason : ''}!`;
    document.getElementById('gameOverModal').style.display = 'flex';
  });

  function loadGame() {
    document.getElementById('gameTitle').textContent = '🐝 Hive';
    document.getElementById('gameCss').href = '/css/games/hive.css';

    const script  = document.createElement('script');
    script.src    = '/js/games/hive.js';
    script.onload = () => {
      gameModule = window.GameModule;
      if (gameModule?.init) {
        gameModule.init(document.getElementById('gameArea'), myPlayerId, myPlayerName);
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
    if (el) el.textContent = state.isMyTurn ? '🟢 Sua vez!' : 'Aguardando...';
  }
})();
