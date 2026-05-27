(function () {
  let container;
  let sendAction   = null;
  let currentState = null;
  let selectedPiece = null; // { piece, type: 'hand'|'board', fromQ, fromR, fromS }

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

  // ── Drag state ────────────────────────────────────────────────────────────
  let isDragging   = false;
  let hasDragged   = false;
  let dragStart    = { x: 0, y: 0 };
  let cameraAtDrag = null;

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
    isDragging   = true;
    hasDragged   = false;
    dragStart    = { x: e.clientX, y: e.clientY };
    cameraAtDrag = { ...camera };
    const svg = document.getElementById('hiveSvg');
    if (svg) svg.style.cursor = 'grabbing';
    e.preventDefault();
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
          <button class="hive-top-btn" id="hiveResetBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="26" height="26">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
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
              <div id="hivePlayerPanel"></div>
              <div class="panel-divider" id="hivePanelDivider"></div>
              <div id="hiveHandRight"></div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('hiveBtnBack').onclick = () => {
      window.location.href = '/lobby/' + window.location.pathname.split('/').pop();
    };

    document.getElementById('hiveResetBtn').onclick = () => {
      if (sendAction) sendAction({ type: 'reset' });
    };
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
    renderPlayerPanel(state);
    renderHandRight(state);
  }

  // ── Board rendering ───────────────────────────────────────────────────────

  function renderBoard(state) {
    const svg = document.getElementById('hiveSvg');
    if (!svg) return;

    const board      = state.board || {};
    const legalMoves = state.legalMoves || [];

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
      const isLegal    = legalTargets.has(posKey) && (!isOccupied || isBeetleMove) && !!currentState?.isMyTurn;
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
        textContent  = `<tspan fill="${teamAccent}">${letter}</tspan>`;
        if (stack.length > 1) textContent += `<tspan font-size="10" dy="8" dx="-6" fill="${teamAccent}">${stack.length}</tspan>`;
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
        onHexClick(q, r, s, occupied, legal);
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
    const isMyTurn   = state.isMyTurn;

    let html = `<div class="hand-title">${esc(me.playerName)}</div><div class="hand-hexes">`;

    let hasAny = false;
    Object.entries(hand).forEach(([piece, count]) => {
      if (count <= 0) return;
      hasAny = true;
      const letter     = PIECE_LETTER[piece] || piece[0].toUpperCase();
      const fill       = PIECE_COLOR[piece]   || '#888';
      const isSelected = selectedPiece?.type === 'hand' && selectedPiece?.piece === piece;
      const disabled   = !isMyTurn;
      const borderClr  = isSelected ? '#ffffffcc' : teamAccent;

      html += `<div class="hex-btn-wrap${isSelected ? ' hx-selected' : ''}${disabled ? ' hx-disabled' : ''}"
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

    if (isMyTurn) {
      el.querySelectorAll('.hex-btn-wrap:not(.hx-disabled)').forEach(wrap => {
        wrap.style.cursor = 'pointer';
        wrap.addEventListener('click', () => onHandPieceClick(wrap.dataset.piece, myIdx));
      });
    }
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
    if (!currentState?.isMyTurn || playerIdx !== currentState.myPlayerIndex) return;
    selectedPiece = (selectedPiece?.type === 'hand' && selectedPiece.piece === piece)
      ? null
      : { type: 'hand', piece };
    render(currentState, sendAction);
  }

  function onHexClick(q, r, s, isOccupied, isLegal) {
    if (!currentState?.isMyTurn) return;

    const posKey        = `${q},${r},${s}`;
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
