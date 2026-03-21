(function () {
  const roomId = window.location.pathname.split('/').pop();
  let myPlayerId  = sessionStorage.getItem('playerId');
  let myPlayerName = sessionStorage.getItem('playerName');
  let isHost  = false;
  let roomData = null;

  const socket = io();

  // Set invite link
  document.getElementById('inviteLink').value = window.location.href;

  // If guest (no name saved), show the name modal
  if (!myPlayerName) {
    document.getElementById('nameModal').style.display = 'flex';
  } else {
    joinRoom(myPlayerName);
  }

  window.joinWithName = function () {
    const name = document.getElementById('guestName').value.trim();
    if (!name) return;
    myPlayerName = name;
    sessionStorage.setItem('playerName', name);
    document.getElementById('nameModal').style.display = 'none';
    joinRoom(name);
  };

  document.getElementById('guestName').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.joinWithName();
  });

  function joinRoom(name) {
    socket.emit('room:join', { roomId, playerName: name });
  }

  // ── Socket events ───────────────────────────────────────────────────────────

  socket.on('room:joined', data => {
    myPlayerId = data.playerId;
    sessionStorage.setItem('playerId', data.playerId);
    isHost   = data.isHost;
    roomData = data;

    document.getElementById('gameBadge').textContent = '🐝 Hive';
    document.title = 'Hive — Sala de Espera';

    renderPlayers(data.players, data.isHost ? data.players[0]?.playerId : null);
    if (data.isHost) document.getElementById('hostControls').style.display = '';
    updateWaitingMsg(data.players, data.minPlayers);

    if (data.status === 'playing') window.location.href = `/game/${roomId}`;
  });

  socket.on('room:join-error', ({ message }) => {
    alert('Erro ao entrar na sala: ' + message);
    window.location.href = '/';
  });

  socket.on('lobby:player-joined', ({ players, newHostId }) => {
    renderPlayers(players, newHostId);
    updateWaitingMsg(players, roomData?.minPlayers);
  });

  socket.on('lobby:player-left', ({ players, newHostId }) => {
    renderPlayers(players, newHostId);
    if (newHostId === myPlayerId) {
      isHost = true;
      document.getElementById('hostControls').style.display = '';
    }
    updateWaitingMsg(players, roomData?.minPlayers);
  });

  socket.on('game:start', ({ roomId: rid }) => {
    window.location.href = `/game/${rid}`;
  });

  socket.on('chat:message', ({ playerName, text }) => {
    const msgs = document.getElementById('chatMessages');
    const div  = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="author">${esc(playerName)}:</span> ${esc(text)}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  });

  // ── UI helpers ──────────────────────────────────────────────────────────────

  function renderPlayers(players, hostId) {
    const list     = document.getElementById('playerList');
    const countEl  = document.getElementById('playerCount');
    const connected = players.filter(p => p.connected);
    countEl.textContent = `(${connected.length})`;

    list.innerHTML = players.map(p => `
      <li>
        <span>${esc(p.playerName)}</span>
        ${p.playerId === hostId ? '<span class="host-badge">Host</span>' : ''}
        ${!p.connected ? '<span class="disconnected">(desconectado)</span>' : ''}
      </li>
    `).join('');
  }

  function updateWaitingMsg(players, minPlayers) {
    const connected = players.filter(p => p.connected).length;
    const el = document.getElementById('waitingMsg');
    if (!minPlayers) return;

    el.textContent = connected < minPlayers
      ? `Aguardando jogadores... (${connected}/${minPlayers} mínimo)`
      : 'Pronto para começar!';

    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.disabled = connected < minPlayers;
      document.getElementById('startMsg').textContent =
        connected < minPlayers ? `Precisa de pelo menos ${minPlayers} jogadores` : '';
    }
  }

  window.startGame = function () { socket.emit('lobby:start', { roomId }); };

  window.copyLink = function () {
    navigator.clipboard.writeText(document.getElementById('inviteLink').value).then(() => {
      document.getElementById('copyMsg').textContent = 'Link copiado!';
      setTimeout(() => { document.getElementById('copyMsg').textContent = ''; }, 2000);
    });
  };

  window.sendChat = function () {
    const input = document.getElementById('chatInput');
    const text  = input.value.trim();
    if (!text) return;
    socket.emit('chat:message', { roomId, text });
    input.value = '';
  };

  window.chatKeyDown = function (e) { if (e.key === 'Enter') window.sendChat(); };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
