(function () {
  'use strict';

  /* ── Game data ─────────────────────────────────────────────── */
  var GAMES = {
    coup: { title: 'COUP', tag: 'BLEFE', accent: '#ffe600' },
    ito:  { title: 'ITO',  tag: 'COOP',  accent: '#00f0ff' },
    hive: { title: 'HIVE', tag: 'ESTRATÉGIA', accent: '#ff7a1f' }
  };

  /* ── State ─────────────────────────────────────────────────── */
  var selectedGame   = null;
  var selectedAvatar = sessionStorage.getItem('playerAvatar') || 'knight';
  var selectedColor  = sessionStorage.getItem('playerColor')  || '#ff2e88';
  var socket         = null;

  /* ── Screen management ─────────────────────────────────────── */
  window.showScreen = function (id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
  };

  /* ── Entry screen ──────────────────────────────────────────── */
  var nameInput = document.getElementById('playerName');
  var savedName = sessionStorage.getItem('playerName');

  if (savedName) {
    nameInput.value = savedName;
    // Go straight to select screen if name already saved
    goToSelect(savedName);
  }

  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doEnter();
  });

  window.doEnter = function () {
    var name = nameInput.value.trim();
    if (!name) {
      var err = document.getElementById('entryError');
      err.textContent = 'DIGITE SEU NOME!';
      nameInput.focus();
      setTimeout(function () { err.textContent = ''; }, 2000);
      return;
    }
    sessionStorage.setItem('playerName', name);
    goToSelect(name);
  };

  function goToSelect(name) {
    // Update brand bar in select screen
    var brandName = document.getElementById('selectBrandName');
    if (brandName) brandName.textContent = name.toUpperCase();

    // Render avatar in select brand bar
    var brandSprite = document.getElementById('selectBrandSprite');
    if (brandSprite) renderSprite(brandSprite, selectedAvatar, selectedColor, 32);

    // Update open rooms count placeholder
    showScreen('screen-select');
    loadRooms();
  }

  /* ── Game tile click ───────────────────────────────────────── */
  window.onGameClick = function (gameId) {
    var name = sessionStorage.getItem('playerName');
    if (!name) {
      showScreen('screen-entry');
      return;
    }
    selectedGame = gameId;
    sessionStorage.setItem('selectedGame', gameId);

    var game = GAMES[gameId] || { title: gameId.toUpperCase(), accent: '#ff2e88' };

    // Update avatar screen header
    var avatarScreenGame = document.getElementById('avatarScreenGame');
    if (avatarScreenGame) avatarScreenGame.textContent = game.title;

    var previewGame = document.getElementById('previewGame');
    if (previewGame) previewGame.textContent = '> ' + game.title;

    // Update preview name
    var previewName = document.getElementById('previewName');
    if (previewName) previewName.textContent = name.toUpperCase();

    // Render preview sprite
    updatePreview();

    // Build avatar grid and color row (only once)
    buildAvatarPicker();

    showScreen('screen-avatar');
  };

  /* ── Avatar picker ─────────────────────────────────────────── */
  var pickerBuilt = false;

  function buildAvatarPicker() {
    if (pickerBuilt) {
      updatePreview();
      return;
    }
    pickerBuilt = true;

    // Avatar grid
    var grid = document.getElementById('avatarGrid');
    if (grid) {
      grid.innerHTML = '';
      AVATAR_KEYS.forEach(function (key) {
        var cell = document.createElement('div');
        cell.className = 'avatar-cell' + (key === selectedAvatar ? ' selected' : '');
        cell.dataset.avatar = key;

        var spriteEl = document.createElement('div');
        spriteEl.className = 'avatar-cell__sprite';
        renderSprite(spriteEl, key, selectedColor, 48);
        cell.appendChild(spriteEl);

        cell.addEventListener('click', function () {
          selectedAvatar = key;
          document.querySelectorAll('.avatar-cell').forEach(function (c) {
            c.classList.remove('selected');
          });
          cell.classList.add('selected');
          updateAvatarGridColors();
          updatePreview();
        });

        grid.appendChild(cell);
      });
    }

    // Color row
    var colorRow = document.getElementById('colorRow');
    if (colorRow) {
      colorRow.innerHTML = '';
      COLOR_PALETTE.forEach(function (hex) {
        var chip = document.createElement('div');
        chip.className = 'color-chip' + (hex === selectedColor ? ' selected' : '');
        chip.style.background = hex;
        chip.style.boxShadow = '0 0 6px ' + hex;
        chip.addEventListener('click', function () {
          selectedColor = hex;
          document.querySelectorAll('.color-chip').forEach(function (c) {
            c.classList.remove('selected');
          });
          chip.classList.add('selected');
          updateAvatarGridColors();
          updatePreview();
        });
        colorRow.appendChild(chip);
      });
    }
  }

  function updateAvatarGridColors() {
    document.querySelectorAll('.avatar-cell').forEach(function (cell) {
      var key = cell.dataset.avatar;
      var spriteEl = cell.querySelector('.avatar-cell__sprite');
      if (spriteEl) renderSprite(spriteEl, key, selectedColor, 48);
    });
  }

  function updatePreview() {
    var el = document.getElementById('previewSprite');
    if (el) renderSprite(el, selectedAvatar, selectedColor, 96);
  }

  /* ── Confirm avatar → create room ──────────────────────────── */
  window.confirmAvatar = function () {
    var name = sessionStorage.getItem('playerName');
    if (!name || !selectedGame) return;

    sessionStorage.setItem('playerAvatar', selectedAvatar);
    sessionStorage.setItem('playerColor',  selectedColor);

    var btn = document.getElementById('btnConfirmAvatar');
    if (btn) { btn.disabled = true; btn.textContent = 'CONECTANDO...'; }

    if (!socket) socket = io();

    socket.emit('room:create', { playerName: name, gameId: selectedGame });

    socket.on('room:created', function (data) {
      sessionStorage.setItem('playerId', data.playerId);
      sessionStorage.setItem('roomId',   data.roomId);
      window.location.href = '/lobby/' + data.roomId;
    });

    socket.on('room:join-error', function (data) {
      alert('Erro: ' + data.message);
      if (btn) { btn.disabled = false; btn.textContent = '✓ CONFIRMAR'; }
      if (socket) { socket.disconnect(); socket = null; }
    });
  };

  /* ── Open rooms list ───────────────────────────────────────── */
  var GAME_LABELS = { hive: 'HIVE', coup: 'COUP', ito: 'ITO' };

  async function loadRooms() {
    try {
      var res   = await fetch('/api/rooms');
      var rooms = await res.json();
      var list  = document.getElementById('roomList');
      var count = document.getElementById('openRoomsCount');

      if (count) count.textContent = rooms.length;

      if (!list) return;

      if (rooms.length === 0) {
        list.innerHTML = '<span class="rooms-empty">Nenhuma sala aberta</span>';
        return;
      }

      list.innerHTML = rooms.map(function (r) {
        var gameLabel = GAME_LABELS[r.gameId] || r.gameId.toUpperCase();
        var game = GAMES[r.gameId] || {};
        var accent = game.accent || 'var(--neon-purple)';
        return (
          '<div class="room-item" style="border-left-color:' + accent + '" onclick="window.location.href=\'/lobby/' + esc(r.roomId) + '\'">' +
            '<div>' +
              '<div class="room-item__name">' + esc(gameLabel) + '</div>' +
              '<div class="room-item__meta">Host: ' + esc(r.hostName) + ' &bull; ' + r.playerCount + '/' + r.maxPlayers + ' jogadores</div>' +
            '</div>' +
            '<button class="btn-px btn-px--sm btn-px--cyan">ENTRAR</button>' +
          '</div>'
        );
      }).join('');
    } catch (_) { /* network error — silently ignore */ }
  }

  loadRooms();
  setInterval(loadRooms, 5000);

  /* ── Particles ─────────────────────────────────────────────── */
  renderParticles();

  /* ── Glitch animation: re-trigger data-text on title ──────── */
  var titleEl = document.querySelector('.arcade-title.glitch');
  if (titleEl && !titleEl.dataset.text) {
    titleEl.dataset.text = titleEl.textContent;
  }

  /* ── HTML escape helper ────────────────────────────────────── */
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
