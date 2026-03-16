(function () {
  const nameInput = document.getElementById('playerName');
  const currentNameEl = document.getElementById('currentName');

  // Load saved name
  const savedName = sessionStorage.getItem('playerName');
  if (savedName) {
    nameInput.value = savedName;
    showCurrentName(savedName);
  }

  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });

  window.saveName = function () {
    const name = nameInput.value.trim();
    if (!name) return;
    sessionStorage.setItem('playerName', name);
    showCurrentName(name);
  };

  function showCurrentName(name) {
    currentNameEl.textContent = `Jogando como: ${name}`;
    currentNameEl.style.display = '';
  }

  window.createRoom = function (gameId) {
    const name = sessionStorage.getItem('playerName') || nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'var(--accent)';
      return;
    }
    sessionStorage.setItem('playerName', name);

    // Lazy load socket.io
    if (typeof io === 'undefined') {
      const script = document.createElement('script');
      script.src = '/socket.io/socket.io.js';
      script.onload = () => doCreateRoom(gameId, name);
      document.head.appendChild(script);
    } else {
      doCreateRoom(gameId, name);
    }
  };

  function doCreateRoom(gameId, playerName) {
    const socket = io();
    socket.emit('room:create', { gameId, playerName });
    socket.on('room:created', ({ roomId, playerId }) => {
      sessionStorage.setItem('playerId', playerId);
      sessionStorage.setItem('roomId', roomId);
      window.location.href = `/lobby/${roomId}`;
    });
    socket.on('room:join-error', ({ message }) => {
      alert('Erro: ' + message);
    });
  }

  // Load open rooms
  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      const rooms = await res.json();
      const list = document.getElementById('roomList');
      if (rooms.length === 0) {
        list.innerHTML = '<p style="color:var(--muted); font-size:0.875rem">Nenhuma sala aberta</p>';
        return;
      }
      const gameLabels = { chess: '♟️ Xadrez', explodingKittens: '💣 Exploding Kittens', coup: '👑 Coup', hive: '🐝 Hive' };
      list.innerHTML = rooms.map(r => `
        <div class="room-item" onclick="joinExisting('${r.roomId}')">
          <div>
            <strong>${gameLabels[r.gameId] || r.gameId}</strong>
            <div class="room-info">Host: ${r.hostName} • ${r.playerCount}/${r.maxPlayers} jogadores</div>
          </div>
          <button class="btn" style="font-size:0.8rem;padding:0.4rem 0.8rem">Entrar</button>
        </div>
      `).join('');
    } catch (e) { /* ignore */ }
  }

  window.joinExisting = function (roomId) {
    window.location.href = `/lobby/${roomId}`;
  };

  loadRooms();
  setInterval(loadRooms, 5000);
})();
