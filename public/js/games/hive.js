(function () {
  let container;
  let sendAction   = null;
  let currentState = null;
  let selectedPiece = null; // { piece, type: 'hand'|'board', fromQ, fromR, fromS }

  const HEX_SIZE = 40;

  const PIECE_EMOJI = { queen: '👑', beetle: '🪲', grasshopper: '🦗', spider: '🕷️', ant: '🐜' };
  const PIECE_NAME  = { queen: 'Rainha', beetle: 'Besouro', grasshopper: 'Gafanhoto', spider: 'Aranha', ant: 'Formiga' };

  // ── Camera (viewBox) state ────────────────────────────────────────────────
  // { x, y, w, h } — the current visible rectangle in SVG-space
  let camera    = null;
  let fitCamera = null; // auto-fit bounds updated each render

  // ── Drag state ────────────────────────────────────────────────────────────
  let isDragging      = false;
  let hasDragged      = false;      // true when mouse moved > threshold during drag
  let dragStart       = { x: 0, y: 0 };
  let cameraAtDrag    = null;

  // Document-level listeners registered once so they survive SVG re-creation
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup',   onDocMouseUp);

  // ── Coordinate helpers ────────────────────────────────────────────────────

  function hexToPixel(q, r) {
    return {
      x: HEX_SIZE * (1.5 * q),
      y: HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
    };
  }

  function hexCorners(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
    }
    return pts.join(' ');
  }

  // ── Camera helpers ────────────────────────────────────────────────────────

  function applyCamera(svg) {
    if (!camera || !svg) return;
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.w} ${camera.h}`);
  }

  function resetCamera() {
    if (!fitCamera) return;
    camera = { ...fitCamera };
    applyCamera(document.getElementById('hiveSvg'));
  }

  // ── Zoom (mouse-wheel) ────────────────────────────────────────────────────

  function onWheel(e) {
    e.preventDefault();
    const svg  = document.getElementById('hiveSvg');
    if (!svg || !camera) return;

    const rect  = svg.getBoundingClientRect();
    // Cursor in SVG-space
    const cx = camera.x + ((e.clientX - rect.left) / rect.width)  * camera.w;
    const cy = camera.y + ((e.clientY - rect.top)  / rect.height) * camera.h;

    const factor = e.deltaY < 0 ? 0.8 : 1.25; // scroll up = zoom in

    // Clamp zoom so the view never becomes ridiculous
    const newW = camera.w * factor;
    const newH = camera.h * factor;
    if (newW < HEX_SIZE * 3 || newW > HEX_SIZE * 120) return;

    // Keep cursor point stationary
    camera = {
      x: cx - (cx - camera.x) * factor,
      y: cy - (cy - camera.y) * factor,
      w: newW,
      h: newH
    };
    applyCamera(svg);
  }

  // ── Pan (drag) ────────────────────────────────────────────────────────────

  function onSvgMouseDown(e) {
    if (e.button !== 0) return;
    isDragging   = true;
    hasDragged   = false;
    dragStart    = { x: e.clientX, y: e.clientY };
    cameraAtDrag = { ...camera };
    const svg = document.getElementById('hiveSvg');
    if (svg) svg.style.cursor = 'grabbing';
    e.preventDefault(); // prevent text selection while dragging
  }

  function onDocMouseMove(e) {
    if (!isDragging || !camera) return;
    const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dist > 4) hasDragged = true;

    const svg = document.getElementById('hiveSvg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - dragStart.x) / rect.width  * cameraAtDrag.w;
    const dy = (e.clientY - dragStart.y) / rect.height * cameraAtDrag.h;

    camera = { ...cameraAtDrag, x: cameraAtDrag.x - dx, y: cameraAtDrag.y - dy };
    applyCamera(svg);
  }

  function onDocMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    const svg = document.getElementById('hiveSvg');
    if (svg) svg.style.cursor = 'grab';
  }

  // ── Init / Render ─────────────────────────────────────────────────────────

  function init(el) {
    container = el;
  }

  function render(state, actionFn) {
    sendAction   = actionFn;
    currentState = state;

    container.innerHTML = `
      <div class="hive-wrapper">
        <div class="hive-info-bar">
          <div class="player-label ${state.currentTurnIndex === 0 ? 'active' : ''}">
            ⬜ ${esc(state.players[0]?.playerName)}${state.myPlayerIndex === 0 ? ' (você)' : ''}
          </div>
          <div class="player-label ${state.currentTurnIndex === 1 ? 'active' : ''}">
            ⬛ ${esc(state.players[1]?.playerName)}${state.myPlayerIndex === 1 ? ' (você)' : ''}
          </div>
          <button class="hive-center-btn" onclick="(function(){var e=document.createEvent('Event');e.initEvent('hive:resetCamera',true,true);document.dispatchEvent(e);})()" title="Centralizar tabuleiro">⊙</button>
        </div>
        <svg id="hiveSvg" class="hive-board-svg"></svg>
        <div class="hive-hand-panel" id="hiveHands"></div>
      </div>`;

    // Listen for reset-camera event emitted by the button
    document.addEventListener('hive:resetCamera', resetCamera, { once: true });

    renderBoard(state);
    renderHands(state, state.isMyTurn, state.myPlayerIndex);
  }

  function renderBoard(state) {
    const svg = document.getElementById('hiveSvg');
    if (!svg) return;

    const board     = state.board || {};
    const legalMoves = state.legalMoves || [];

    // ── Collect positions to render ─────────────────────────────────────────
    const positions = new Set();

    Object.keys(board).forEach(k => positions.add(k));
    legalMoves.forEach(m => {
      if (m.type === 'place')     positions.add(`${m.q},${m.r},${m.s}`);
      else if (m.type === 'move') positions.add(`${m.toQ},${m.toR},${m.toS}`);
    });
    Object.keys(board).forEach(k => {
      const [q, r, s] = k.split(',').map(Number);
      [[-1,1,0],[1,-1,0],[1,0,-1],[-1,0,1],[0,1,-1],[0,-1,1]].forEach(([dq,dr,ds]) => {
        positions.add(`${q+dq},${r+dr},${s+ds}`);
      });
    });

    // ── Legal targets filtered by selected piece ────────────────────────────
    const legalTargets = new Set();
    legalMoves.forEach(m => {
      if (m.type === 'place') {
        if (!selectedPiece || (selectedPiece.type === 'hand' && selectedPiece.piece === m.piece)) {
          legalTargets.add(`${m.q},${m.r},${m.s}`);
        }
      } else if (m.type === 'move' && selectedPiece?.type === 'board') {
        if (m.fromQ === selectedPiece.fromQ && m.fromR === selectedPiece.fromR && m.fromS === selectedPiece.fromS) {
          legalTargets.add(`${m.toQ},${m.toR},${m.toS}`);
        }
      }
    });

    const selectedKey = selectedPiece?.type === 'board'
      ? `${selectedPiece.fromQ},${selectedPiece.fromR},${selectedPiece.fromS}`
      : null;

    // ── Compute pixel coords + bounding box ─────────────────────────────────
    const hexData = [...positions].map(posKey => {
      const [q, r, s] = posKey.split(',').map(Number);
      return { posKey, q, r, s, ...hexToPixel(q, r) };
    });

    if (hexData.length > 0) {
      const PAD  = HEX_SIZE * 2;
      const minX = Math.min(...hexData.map(h => h.x)) - HEX_SIZE - PAD;
      const maxX = Math.max(...hexData.map(h => h.x)) + HEX_SIZE + PAD;
      const minY = Math.min(...hexData.map(h => h.y)) - HEX_SIZE - PAD;
      const maxY = Math.max(...hexData.map(h => h.y)) + HEX_SIZE + PAD;
      fitCamera = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

      // Initialise camera on first render; preserve it on subsequent renders
      if (!camera) camera = { ...fitCamera };
      applyCamera(svg);
    }

    // ── Build SVG content ───────────────────────────────────────────────────
    let svgContent = '';
    const isBeetleMove = selectedPiece?.type === 'board' && selectedPiece?.piece === 'beetle';

    for (const { posKey, q, r, s, x, y } of hexData) {
      const stack      = board[posKey];
      const isOccupied = !!(stack && stack.length > 0);
      const isLegal    = legalTargets.has(posKey) && (!isOccupied || isBeetleMove) && !!currentState?.isMyTurn;
      const isSelected = posKey === selectedKey;

      let hexClass    = 'hex-empty';
      let textContent = '';

      if (isSelected) hexClass = 'hex-selected';
      else if (isLegal) hexClass = 'hex-legal';
      else if (isOccupied) {
        const top = stack[stack.length - 1];
        hexClass    = top.playerIndex === 0 ? 'hex-white' : 'hex-black';
        textContent = PIECE_EMOJI[top.piece] || top.piece[0].toUpperCase();
        if (stack.length > 1) textContent += `<tspan font-size="9" dy="8" dx="-6">${stack.length}</tspan>`;
      }

      svgContent += `<g class="hex-cell" data-q="${q}" data-r="${r}" data-s="${s}" data-occupied="${isOccupied}" data-legal="${isLegal}">
        <polygon class="${hexClass}" points="${hexCorners(x, y, HEX_SIZE - 2)}"/>
        ${textContent ? `<text class="hex-text" x="${x}" y="${y}">${textContent}</text>` : ''}
      </g>`;
    }

    svg.innerHTML = svgContent;

    // ── Attach SVG interaction events ───────────────────────────────────────
    svg.style.cursor = 'grab';
    svg.addEventListener('wheel',     onWheel,      { passive: false });
    svg.addEventListener('mousedown', onSvgMouseDown);

    svg.querySelectorAll('.hex-cell').forEach(g => {
      const legal    = g.dataset.legal    === 'true';
      const occupied = g.dataset.occupied === 'true';
      if (legal || occupied) g.style.cursor = 'pointer';

      g.addEventListener('click', () => {
        if (hasDragged) return; // suppress clicks that were actually drags
        const q = parseInt(g.dataset.q);
        const r = parseInt(g.dataset.r);
        const s = parseInt(g.dataset.s);
        onHexClick(q, r, s, occupied, legal);
      });
    });
  }

  // ── Hand panel ────────────────────────────────────────────────────────────

  function renderHands(state, isMyTurn, myPlayerIndex) {
    const handsEl = document.getElementById('hiveHands');
    if (!handsEl) return;

    state.players.forEach((p, idx) => {
      const hand        = p.hand || {};
      const totalPieces = Object.values(hand).reduce((s, v) => s + v, 0);

      const panel = document.createElement('div');
      panel.className = 'hive-hand';
      panel.innerHTML = `<h3>${esc(p.playerName)} ${idx === myPlayerIndex ? '(você)' : ''} — ${p.color === 'white' ? '⬜' : '⬛'}</h3>
        <div class="pieces" id="hand_${idx}"></div>`;
      handsEl.appendChild(panel);

      const piecesEl = panel.querySelector('.pieces');
      if (totalPieces === 0) {
        piecesEl.innerHTML = '<span style="color:var(--muted);font-size:0.8rem">Sem peças na mão</span>';
        return;
      }

      Object.entries(hand).forEach(([piece, count]) => {
        if (count <= 0) return;
        const btn        = document.createElement('button');
        const isSelected = selectedPiece?.type === 'hand' && selectedPiece?.piece === piece && idx === myPlayerIndex;
        btn.className  = `hive-piece-btn ${p.color === 'white' ? 'white-piece' : 'black-piece'}${isSelected ? ' selected' : ''}`;
        btn.textContent = `${PIECE_EMOJI[piece] || piece} x${count}`;
        btn.title       = PIECE_NAME[piece] || piece;
        btn.disabled    = !isMyTurn || idx !== myPlayerIndex;
        btn.addEventListener('click', () => onHandPieceClick(piece, idx));
        piecesEl.appendChild(btn);
      });
    });
  }

  // ── Game interaction ──────────────────────────────────────────────────────

  function onHandPieceClick(piece, playerIdx) {
    if (!currentState?.isMyTurn || playerIdx !== currentState.myPlayerIndex) return;
    selectedPiece = (selectedPiece?.type === 'hand' && selectedPiece.piece === piece)
      ? null
      : { type: 'hand', piece };
    render(currentState, sendAction);
  }

  function onHexClick(q, r, s, isOccupied, isLegal) {
    if (!currentState?.isMyTurn) return;

    const posKey       = `${q},${r},${s}`;
    const myPlayerIndex = currentState.myPlayerIndex;

    if (isOccupied && !selectedPiece) {
      const stack = currentState.board[posKey];
      if (stack && stack[stack.length - 1].playerIndex === myPlayerIndex) {
        selectedPiece = { type: 'board', fromQ: q, fromR: r, fromS: s, piece: stack[stack.length - 1].piece };
        render(currentState, sendAction);
      }
      return;
    }

    if (isLegal && selectedPiece) {
      if (selectedPiece.type === 'hand') {
        sendAction({ type: 'place', piece: selectedPiece.piece, q, r, s });
      } else if (selectedPiece.type === 'board') {
        sendAction({ type: 'move', fromQ: selectedPiece.fromQ, fromR: selectedPiece.fromR, fromS: selectedPiece.fromS, toQ: q, toR: r, toS: s });
      }
      selectedPiece = null;
      return;
    }

    if (selectedPiece) {
      selectedPiece = null;
      render(currentState, sendAction);
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render };
})();
