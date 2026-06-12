(function () {
  let container;
  let sendAction   = null;
  let currentState = null;
  let selectedPiece = null; // { piece, type: 'hand'|'board', fromQ, fromR, fromS }
  let isHostPlayer  = false;

  const HEX_SIZE = 40;

  let panelOpen = true;

  const PIECE_LETTER = { queen: 'R', beetle: 'B', grasshopper: 'G', spider: 'A', ant: 'F' };
  const PIECE_NAME   = { queen: 'Rainha', beetle: 'Besouro', grasshopper: 'Gafanhoto', spider: 'Aranha', ant: 'Formiga' };

  // Fill color by piece type (same regardless of team)
  const PIECE_COLOR = {
    queen:       '#e6c200', // yellow
    ant:         '#1a6bcc', // blue
    grasshopper: '#1e8c2a', // green
    spider:      '#7a4a1e', // brown
    beetle:      '#7b2fa0', // purple
  };

  // Team accent: border + letter color
  const TEAM_COLOR = ['#ffffff', '#000000'];

  // ── Camera (viewBox) state ────────────────────────────────────────────────
  let camera    = null;
  let fitCamera = null;

  // ── Camera pan state ──────────────────────────────────────────────────────
  let isDragging   = false;
  let hasDragged   = false;
  let dragStart    = { x: 0, y: 0 };
  let cameraAtDrag = null;

  // ── Piece drag state ──────────────────────────────────────────────────────
  let pieceDrag = null; // { type:'hand'|'board', piece, playerIdx, fromQ?, fromR?, fromS? }
  let dragEl    = null; // ghost DOM element

  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup',   onDocMouseUp);

  // ── Coordinate helpers ────────────────────────────────────────────────────

  function cubeRound(fq, fr, fs) {
    let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs);
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds)        r = -q - s;
    else                     s = -q - r;
    return { q, r, s };
  }

  function screenToHex(clientX, clientY) {
    const svg = document.getElementById('hiveSvg');
    if (!svg || !camera) return null;
    // Use SVG's native transform to correctly account for preserveAspectRatio letterboxing
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    const fq = svgPt.x / (HEX_SIZE * 1.5);
    const fr = (svgPt.y / HEX_SIZE - Math.sqrt(3) / 2 * fq) / Math.sqrt(3);
    return cubeRound(fq, fr, -fq - fr);
  }

  function createDragGhost(piece, playerIdx, clientX, clientY) {
    const fill   = PIECE_COLOR[piece]     || '#888';
    const accent = TEAM_COLOR[playerIdx]  || '#fff';
    const letter = PIECE_LETTER[piece]    || piece[0].toUpperCase();
    const el = document.createElement('div');
    el.id = 'hiveDragGhost';
    el.style.cssText = `position:fixed;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0.88;left:${clientX}px;top:${clientY}px;transition:none;`;
    el.innerHTML = `
      <div style="width:88px;height:76px;clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);background:${accent};display:flex;align-items:center;justify-content:center;">
        <div style="width:80px;height:68px;clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);background:${fill};display:flex;align-items:center;justify-content:center;">
          <span style="font-size:1.8rem;font-weight:900;color:${accent};font-family:sans-serif;pointer-events:none;">${letter}</span>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  function removeDragGhost() {
    if (dragEl) { dragEl.remove(); dragEl = null; }
  }

  function startPieceDrag(type, piece, playerIdx, clientX, clientY, fromQ, fromR, fromS) {
    pieceDrag = { type, piece, playerIdx, fromQ, fromR, fromS };
    dragEl    = createDragGhost(piece, playerIdx, clientX, clientY);
    dragStart  = { x: clientX, y: clientY };
    hasDragged = false;
    // Select the piece visually
    if (type === 'hand') {
      selectedPiece = { type: 'hand', piece };
    } else {
      selectedPiece = { type: 'board', fromQ, fromR, fromS, piece };
    }
    renderBoard(currentState);
  }

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
    const svg = document.getElementById('hiveSvg');
    if (!svg || !camera) return;

    const rect   = svg.getBoundingClientRect();
    const cx = camera.x + ((e.clientX - rect.left) / rect.width)  * camera.w;
    const cy = camera.y + ((e.clientY - rect.top)  / rect.height) * camera.h;

    const factor = e.deltaY < 0 ? 0.8 : 1.25;
    const newW = camera.w * factor;
    const newH = camera.h * factor;
    if (newW < HEX_SIZE * 3 || newW > HEX_SIZE * 120) return;

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

    // Check if pressing on an occupied hex (my piece) → piece drag
    const cell = e.target.closest?.('.hex-cell');
    if (cell && cell.dataset.occupied === 'true' && currentState) {
      const q = parseInt(cell.dataset.q);
      const r = parseInt(cell.dataset.r);
      const s = parseInt(cell.dataset.s);
      const stack = currentState.board[`${q},${r},${s}`];
      if (stack && stack[stack.length - 1].playerIndex === currentState.myPlayerIndex) {
        const top = stack[stack.length - 1];
        startPieceDrag('board', top.piece, top.playerIndex, e.clientX, e.clientY, q, r, s);
        e.preventDefault();
        return;
      }
    }

    // Otherwise pan camera
    isDragging   = true;
    hasDragged   = false;
    dragStart    = { x: e.clientX, y: e.clientY };
    cameraAtDrag = { ...camera };
    const svg = document.getElementById('hiveSvg');
    if (svg) svg.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onDocMouseMove(e) {
    // Move ghost if piece dragging
    if (pieceDrag && dragEl) {
      const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      if (dist > 4) hasDragged = true;
      dragEl.style.left = e.clientX + 'px';
      dragEl.style.top  = e.clientY + 'px';
      return;
    }

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

  function onDocMouseUp(e) {
    // Drop piece
    if (pieceDrag) {
      removeDragGhost();
      if (hasDragged) {
        const hex = screenToHex(e.clientX, e.clientY);
        if (hex && sendAction) {
          if (pieceDrag.type === 'hand') {
            sendAction({ type: 'place', piece: pieceDrag.piece, q: hex.q, r: hex.r, s: hex.s });
          } else {
            sendAction({ type: 'move', fromQ: pieceDrag.fromQ, fromR: pieceDrag.fromR, fromS: pieceDrag.fromS, toQ: hex.q, toR: hex.r, toS: hex.s });
          }
          selectedPiece = null;
        }
      }
      pieceDrag = null;
      hasDragged = false;
      return;
    }

    if (!isDragging) return;
    isDragging = false;
    const svg = document.getElementById('hiveSvg');
    if (svg) svg.style.cursor = 'grab';
  }

  // ── Init / Render ─────────────────────────────────────────────────────────

  function init(el, playerId, playerName, isHost) {
    container    = el;
    isHostPlayer = !!isHost;
  }

  function render(state, actionFn) {
    sendAction   = actionFn;
    currentState = state;

    const roomId = esc(window.location.pathname.split('/').pop());

    container.innerHTML = `
      <div class="hive-wrapper">
        <div class="hive-top-bar">
          <button class="hive-top-btn" id="hiveBtnBack">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="26" height="26">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          ${isHostPlayer ? `<button class="hive-top-btn" id="hiveResetBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="26" height="26">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>` : ''}
        </div>
        <div class="hive-main">
          <svg id="hiveSvg" class="hive-board-svg"></svg>
          <div class="hive-right">
            <button class="hive-toggle-btn" id="hiveToggleBtn">
              <svg id="hiveToggleIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
            <div class="hive-side-panel${panelOpen ? '' : ' panel-collapsed'}" id="hiveSidePanel">
              <div id="hiveHandRight"></div>
            </div>
          </div>
        </div>
      </div>`;

    window.holdToConfirm(document.getElementById('hiveBtnBack'), () => {
      if (sendAction) sendAction({ type: 'leave' });
      // fallback: se o servidor não responder com game:left, navega mesmo assim
      setTimeout(() => { window.location.href = '/'; }, 1000);
    });

    if (isHostPlayer) {
      window.holdToConfirm(document.getElementById('hiveResetBtn'), () => {
        if (sendAction) sendAction({ type: 'reset' });
      });
    }
    document.getElementById('hiveToggleBtn').addEventListener('click', () => {
      panelOpen = !panelOpen;
      const panel = document.getElementById('hiveSidePanel');
      const icon  = document.getElementById('hiveToggleIcon');
      if (panelOpen) {
        panel.classList.remove('panel-collapsed');
        icon.innerHTML = `<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`;
      } else {
        panel.classList.add('panel-collapsed');
        icon.innerHTML = `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`;
      }
    });

    renderBoard(state);
    renderHandRight(state);
  }

  // ── Board rendering ───────────────────────────────────────────────────────

  function renderBoard(state) {
    const svg = document.getElementById('hiveSvg');
    if (!svg) return;

    const board      = state.board || {};
    const legalMoves = state.legalMoves || [];

    const positions = new Set();

    // Always show a grid of hexes around the origin so the board is never empty
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        const s = -q - r;
        if (Math.abs(s) <= 3) positions.add(`${q},${r},${s}`);
      }
    }

    Object.keys(board).forEach(k => positions.add(k));
    Object.keys(board).forEach(k => {
      const [q, r, s] = k.split(',').map(Number);
      [[-1,1,0],[1,-1,0],[1,0,-1],[-1,0,1],[0,1,-1],[0,-1,1]].forEach(([dq,dr,ds]) => {
        positions.add(`${q+dq},${r+dr},${s+ds}`);
      });
    });

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
      if (!camera) camera = { ...fitCamera };
      applyCamera(svg);
    }

    let svgContent = '';
    const isBeetleMove = selectedPiece?.type === 'board' && selectedPiece?.piece === 'beetle';

    for (const { posKey, q, r, s, x, y } of hexData) {
      const stack      = board[posKey];
      const isOccupied = !!(stack && stack.length > 0);
      const isLegal    = legalTargets.has(posKey) && (!isOccupied || isBeetleMove);
      const isSelected = posKey === selectedKey;

      let hexClass    = 'hex-empty';
      let hexStyle    = '';
      let textContent = '';

      if (isSelected) {
        hexClass = 'hex-selected';
      } else if (isLegal) {
        hexClass = 'hex-legal';
      } else if (isOccupied) {
        const top        = stack[stack.length - 1];
        const fill       = PIECE_COLOR[top.piece]  || '#888';
        const teamAccent = TEAM_COLOR[top.playerIndex] || '#fff';
        hexClass  = 'hex-player';
        hexStyle  = `fill:${fill};stroke:${teamAccent};stroke-width:4;`;
        const letter = PIECE_LETTER[top.piece] || top.piece[0].toUpperCase();
        textContent  = `<tspan fill="${teamAccent}" x="${x}">${letter}</tspan>`;
        if (stack.length > 1) textContent += `<tspan fill="${teamAccent}" x="${x}" dy="14" font-size="11">${stack.length}</tspan>`;
      }

      svgContent += `<g class="hex-cell" data-q="${q}" data-r="${r}" data-s="${s}" data-occupied="${isOccupied}" data-legal="${isLegal}">
        <polygon class="${hexClass}" style="${hexStyle}" points="${hexCorners(x, y, HEX_SIZE - 2)}"/>
        ${textContent ? `<text class="hex-text" x="${x}" y="${y}">${textContent}</text>` : ''}
      </g>`;
    }

    svg.innerHTML = svgContent;

    svg.style.cursor = 'grab';
    svg.addEventListener('wheel',     onWheel,       { passive: false });
    svg.addEventListener('mousedown', onSvgMouseDown);

    svg.querySelectorAll('.hex-cell').forEach(g => {
      const legal    = g.dataset.legal    === 'true';
      const occupied = g.dataset.occupied === 'true';
      if (legal || occupied) g.style.cursor = 'pointer';

      g.addEventListener('click', () => {
        if (hasDragged) return;
        const q = parseInt(g.dataset.q);
        const r = parseInt(g.dataset.r);
        const s = parseInt(g.dataset.s);
        onHexClick(q, r, s, occupied);
      });
    });
  }

  // ── Hand panel (right) ───────────────────────────────────────────────────

  function renderHandRight(state) {
    const el = document.getElementById('hiveHandRight');
    if (!el) return;

    const myIdx = state.myPlayerIndex;
    const me    = state.players?.[myIdx];
    if (!me) { el.innerHTML = ''; return; }

    const hand       = me.hand || {};
    const teamAccent = TEAM_COLOR[myIdx] || '#fff';
    let html = `<div class="hand-hexes">`;

    let hasAny = false;
    Object.entries(hand).forEach(([piece, count]) => {
      if (count <= 0) return;
      hasAny = true;
      const letter     = PIECE_LETTER[piece] || piece[0].toUpperCase();
      const fill       = PIECE_COLOR[piece]   || '#888';
      const isSelected = selectedPiece?.type === 'hand' && selectedPiece?.piece === piece;
      const borderClr  = isSelected ? '#ffffffcc' : teamAccent;

      html += `<div class="hex-btn-wrap${isSelected ? ' hx-selected' : ''}"
                    data-piece="${piece}" title="${PIECE_NAME[piece] || piece}">
        <div class="hex-btn-outer" style="background:${borderClr}">
          <div class="hex-btn-inner" style="background:${fill}">
            <span class="hx-letter" style="color:${teamAccent}">${letter}</span>
            <span class="hx-count"  style="color:${teamAccent}">${count}</span>
          </div>
        </div>
      </div>`;
    });

    if (!hasAny) {
      html += `<span class="hand-empty">Sem peças</span>`;
    }

    html += `</div>`;
    el.innerHTML = html;

    el.querySelectorAll('.hex-btn-wrap').forEach(wrap => {
      wrap.style.cursor = 'grab';
      wrap.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        startPieceDrag('hand', wrap.dataset.piece, myIdx, e.clientX, e.clientY);
      });
      wrap.addEventListener('click', () => {
        if (!hasDragged) onHandPieceClick(wrap.dataset.piece, myIdx);
      });
    });
  }

  // ── Player panel (right) ──────────────────────────────────────────────────

  function renderPlayerPanel(state) {
    const el = document.getElementById('hivePlayerPanel');
    if (!el) return;

    let html = '';
    state.players.forEach((p, idx) => {
      const teamAccent = TEAM_COLOR[idx] || '#fff';
      const letter     = (p.playerName || '?')[0].toUpperCase();
      const hand       = p.hand || {};
      const total      = Object.values(hand).reduce((s, v) => s + v, 0);
      const isActive   = state.currentTurnIndex === idx;

      html += `<div class="panel-player${isActive ? ' pp-active' : ''}">
        <div class="panel-hex-outer" style="background:${teamAccent}">
          <div class="panel-hex-inner" style="background:#5a3e00">
            <span class="ph-letter" style="color:${teamAccent}">${letter}</span>
            <span class="ph-count"  style="color:${teamAccent}">${total}</span>
          </div>
        </div>
      </div>`;
    });

    el.innerHTML = html;
  }

  // ── Game interaction ──────────────────────────────────────────────────────

  function onHandPieceClick(piece, playerIdx) {
    if (playerIdx !== currentState.myPlayerIndex) return;
    selectedPiece = (selectedPiece?.type === 'hand' && selectedPiece.piece === piece)
      ? null
      : { type: 'hand', piece };
    render(currentState, sendAction);
  }

  function onHexClick(q, r, s, isOccupied) {
    if (!currentState) return;

    const posKey        = `${q},${r},${s}`;
    const myPlayerIndex = currentState.myPlayerIndex;

    // Select my piece on board
    if (isOccupied && !selectedPiece) {
      const stack = currentState.board[posKey];
      if (stack && stack[stack.length - 1].playerIndex === myPlayerIndex) {
        selectedPiece = { type: 'board', fromQ: q, fromR: r, fromS: s, piece: stack[stack.length - 1].piece };
        render(currentState, sendAction);
      }
      return;
    }

    // Drop selected piece anywhere
    if (selectedPiece) {
      if (selectedPiece.type === 'hand') {
        sendAction({ type: 'place', piece: selectedPiece.piece, q, r, s });
      } else if (selectedPiece.type === 'board') {
        sendAction({ type: 'move', fromQ: selectedPiece.fromQ, fromR: selectedPiece.fromR, fromS: selectedPiece.fromS, toQ: q, toR: r, toS: s });
      }
      selectedPiece = null;
      return;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render };
})();
