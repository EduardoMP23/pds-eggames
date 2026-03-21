(function () {
  const nameInput    = document.getElementById('playerName');
  const currentNameEl = document.getElementById('currentName');

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

  window.createRoom = function () {
    const name = sessionStorage.getItem('playerName') || nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'var(--accent)';
      return;
    }
    sessionStorage.setItem('playerName', name);

    const socket = io();
    socket.emit('room:create', { playerName: name });
    socket.on('room:created', ({ roomId, playerId }) => {
      sessionStorage.setItem('playerId', playerId);
      sessionStorage.setItem('roomId', roomId);
      window.location.href = `/lobby/${roomId}`;
    });
    socket.on('room:join-error', ({ message }) => {
      alert('Erro: ' + message);
      socket.disconnect();
    });
  };

  // ── Open rooms list ─────────────────────────────────────────────────────────
  async function loadRooms() {
    try {
      const res   = await fetch('/api/rooms');
      const rooms = await res.json();
      const list  = document.getElementById('roomList');

      if (rooms.length === 0) {
        list.innerHTML = '<p style="color:var(--muted); font-size:0.875rem">Nenhuma sala aberta</p>';
        return;
      }

      list.innerHTML = rooms.map(r => `
        <div class="room-item" onclick="window.location.href='/lobby/${r.roomId}'">
          <div>
            <strong>🐝 Hive</strong>
            <div class="room-info">Host: ${esc(r.hostName)} &bull; ${r.playerCount}/${r.maxPlayers} jogadores</div>
          </div>
          <button class="btn" style="font-size:0.8rem;padding:0.4rem 0.8rem">Entrar</button>
        </div>
      `).join('');
    } catch (_) { /* network error — silently ignore */ }
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  loadRooms();
  setInterval(loadRooms, 5000);
})();
