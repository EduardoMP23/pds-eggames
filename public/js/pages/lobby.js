(function () {
  'use strict';

  /* ── Helpers ───────────────────────────────────────────────── */
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Game labels ───────────────────────────────────────────── */
  var GAME_LABELS = { hive: 'HIVE', coup: 'COUP', ito: 'ITO' };
  var GAME_ACCENTS = { hive: 'px-frame--green', coup: 'px-frame--yellow', ito: 'px-frame--cyan' };

  /* ── State ─────────────────────────────────────────────────── */
  var roomId       = window.location.pathname.split('/').pop();
  var myPlayerId   = sessionStorage.getItem('playerId');
  var myPlayerName = sessionStorage.getItem('playerName');
  var myAvatar     = sessionStorage.getItem('playerAvatar') || 'knight';
  var myColor      = sessionStorage.getItem('playerColor')  || '#ff2e88';
  var isHost       = false;
  var isReady      = false;
  var roomData     = null;

  /* ── Avatar cycling for other players ─────────────────────── */
  var FALLBACK_AVATARS = AVATAR_KEYS || ['knight','wizard','ninja','robot','alien','cat'];
  var FALLBACK_COLORS  = COLOR_PALETTE || ['#ff2e88','#00f0ff','#39ff7a','#ffe600','#ff7a1f','#b14aed'];

  function avatarForIndex(i) {
    return FALLBACK_AVATARS[i % FALLBACK_AVATARS.length];
  }
  function colorForIndex(i) {
    return FALLBACK_COLORS[i % FALLBACK_COLORS.length];
  }

  /* ── Socket setup ──────────────────────────────────────────── */
  var socket = io();

  /* ── Brand bar: show our avatar ───────────────────────────── */
  var brandSprite = document.getElementById('lobbyBrandSprite');
  var brandName   = document.getElementById('lobbyBrandName');
  if (brandSprite) renderSprite(brandSprite, myAvatar, myColor, 32);
  if (brandName && myPlayerName) brandName.textContent = myPlayerName.toUpperCase();

  /* ── Room code display ─────────────────────────────────────── */
  var lobbyRoomCode = document.getElementById('lobbyRoomCode');
  if (lobbyRoomCode) lobbyRoomCode.textContent = roomId;

  /* ── Guest entry: if no name, redirect to home with roomId ─── */
  if (!myPlayerName) {
    // Store destination and send user to pick a name
    sessionStorage.setItem('pendingRoom', roomId);
    window.location.href = '/';
    return; // stop execution
  }

  /* ── Join room ─────────────────────────────────────────────── */
  function joinRoom(name) {
    socket.emit('room:join', { roomId: roomId, playerName: name, playerId: myPlayerId });
  }

  joinRoom(myPlayerName);

  /* ══════════════════════════════════════════════════════════
     SOCKET EVENTS
  ══════════════════════════════════════════════════════════ */

  socket.on('room:joined', function (data) {
    myPlayerId = data.playerId;
    sessionStorage.setItem('playerId', data.playerId);
    isHost   = data.isHost;
    roomData = data;

    // Update game name display
    var gameName = document.getElementById('lobbyGameName');
    if (gameName) {
      gameName.textContent = GAME_LABELS[data.gameId] || (data.gameId || '—').toUpperCase();
    }
    document.title = (GAME_LABELS[data.gameId] || 'Lobby') + ' — PIXEL.LOBBY';

    // Host controls
    updateHostControls();

    renderPlayers(data.players, data.isHost ? (data.players[0] && data.players[0].playerId) : null);
    updateWaitingMsg(data.players, data.minPlayers);

    if (data.status === 'playing') {
      window.location.href = '/game/' + roomId;
    }
  });

  socket.on('room:join-error', function (data) {
    alert('Erro ao entrar na sala: ' + data.message);
    window.location.href = '/';
  });

  socket.on('lobby:player-joined', function (data) {
    renderPlayers(data.players, data.newHostId);
    updateWaitingMsg(data.players, roomData && roomData.minPlayers);
  });

  socket.on('lobby:player-left', function (data) {
    renderPlayers(data.players, data.newHostId);
    if (data.newHostId === myPlayerId) {
      isHost = true;
      updateHostControls();
    }
    updateWaitingMsg(data.players, roomData && roomData.minPlayers);
  });

  socket.on('lobby:host-changed', function (data) {
    renderPlayers(data.players, data.newHostId);
    if (data.newHostId === myPlayerId) {
      isHost = true;
      updateHostControls();
    }
    updateWaitingMsg(data.players, roomData && roomData.minPlayers);
  });

  socket.on('game:start', function (data) {
    window.location.href = '/game/' + (data.roomId || roomId);
  });

  socket.on('chat:message', function (data) {
    appendChatMsg(data.playerName, data.text);
  });

  /* ══════════════════════════════════════════════════════════
     UI HELPERS
  ══════════════════════════════════════════════════════════ */

  function updateHostControls() {
    var startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.style.display = isHost ? '' : 'none';
    }
  }

  function renderPlayers(players, hostId) {
    var list    = document.getElementById('playerList');
    var countEl = document.getElementById('playerCount');

    if (!list) return;

    var connected = players.filter(function (p) { return p.connected; });
    if (countEl) countEl.textContent = '(' + connected.length + ')';

    list.innerHTML = '';

    players.forEach(function (p, idx) {
      var isMe = p.playerId === myPlayerId;
      var isPlayerHost = p.playerId === hostId;
      var pAvatar, pColor;

      if (isMe) {
        pAvatar = myAvatar;
        pColor  = myColor;
      } else {
        pAvatar = avatarForIndex(idx);
        pColor  = colorForIndex(idx);
      }

      var row = document.createElement('div');
      row.className = 'player-row';
      row.style.borderLeftColor = pColor;

      // Sprite
      var spriteEl = document.createElement('div');
      spriteEl.className = 'player-row__sprite';
      renderSprite(spriteEl, pAvatar, pColor, 40);
      row.appendChild(spriteEl);

      // Name
      var nameEl = document.createElement('div');
      nameEl.className = 'player-row__name';
      nameEl.textContent = p.playerName + (isMe ? ' (você)' : '');
      row.appendChild(nameEl);

      // Badges
      var badges = document.createElement('div');
      badges.className = 'player-row__badges';

      if (isPlayerHost) {
        var hostBadge = document.createElement('span');
        hostBadge.className = 'status-host';
        hostBadge.textContent = 'HOST';
        badges.appendChild(hostBadge);
      }

      if (!p.connected) {
        var dcBadge = document.createElement('span');
        dcBadge.className = 'status-dc';
        dcBadge.textContent = 'DC';
        badges.appendChild(dcBadge);
      } else if (isPlayerHost) {
        // already shown
      } else {
        var waitBadge = document.createElement('span');
        waitBadge.className = 'status-wait';
        waitBadge.textContent = 'AGUARD';
        badges.appendChild(waitBadge);
      }

      row.appendChild(badges);
      list.appendChild(row);
    });
  }

  function updateWaitingMsg(players, minPlayers) {
    var connected = players.filter(function (p) { return p.connected; }).length;
    var el = document.getElementById('waitingMsg');
    if (!el || !minPlayers) return;

    if (connected < minPlayers) {
      el.textContent = 'Aguardando jogadores... (' + connected + '/' + minPlayers + ' mínimo)';
    } else {
      el.textContent = 'Pronto para começar!';
    }

    var startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.disabled = connected < minPlayers;
    }

    var startMsg = document.getElementById('startMsg');
    if (startMsg) {
      startMsg.textContent = connected < minPlayers
        ? 'Precisa de pelo menos ' + minPlayers + ' jogadores'
        : '';
    }
  }

  function appendChatMsg(playerName, text) {
    var log = document.getElementById('chatMessages');
    if (!log) return;
    var msg = document.createElement('div');
    msg.className = 'chat-msg';
    var author = document.createElement('span');
    author.className = 'chat-author';
    author.textContent = playerName + ':';
    var body = document.createElement('span');
    body.className = 'chat-text';
    body.textContent = text;
    msg.appendChild(author);
    msg.appendChild(body);
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════
     ACTIONS
  ══════════════════════════════════════════════════════════ */

  window.startGame = function () {
    socket.emit('lobby:start', { roomId: roomId });
  };

  window.toggleReady = function () {
    isReady = !isReady;
    var btn = document.getElementById('btnReady');
    if (btn) {
      if (isReady) {
        btn.textContent = '✓ PRONTO';
        btn.classList.remove('btn-px--green');
        btn.classList.add('btn-px--ghost');
      } else {
        btn.textContent = 'PRONTO';
        btn.classList.add('btn-px--green');
        btn.classList.remove('btn-px--ghost');
      }
    }
    // Could emit ready state to server if supported in the future
  };

  window.copyLink = function () {
    var text = window.location.href;
    var showMsg = function () {
      var el = document.getElementById('copyMsg');
      if (el) {
        el.textContent = 'Link copiado!';
        setTimeout(function () { if (el) el.textContent = ''; }, 2000);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showMsg).catch(function () {
        fallbackCopy(text);
        showMsg();
      });
    } else {
      fallbackCopy(text);
      showMsg();
    }
  };

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }

  window.sendChat = function () {
    var input = document.getElementById('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    socket.emit('chat:message', { roomId: roomId, text: text });
    input.value = '';
  };

  window.chatKeyDown = function (e) {
    if (e.key === 'Enter') window.sendChat();
  };

  /* ── Particles ─────────────────────────────────────────────── */
  renderParticles();

  /* ── Pending room redirect (guest flow) ────────────────────── */
  // If user was sent here from a direct link without a name,
  // after picking a name on home page they come back.
  var pending = sessionStorage.getItem('pendingRoom');
  if (pending && pending === roomId) {
    sessionStorage.removeItem('pendingRoom');
  }

})();
