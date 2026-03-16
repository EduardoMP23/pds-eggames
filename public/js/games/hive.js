(function () {
  let container, myPlayerId, myPlayerName;
  let sendAction = null;
  let currentState = null;
  let selectedPiece = null; // { piece, type: 'hand'|'board', fromQ, fromR, fromS }
  let highlightedMoves = [];

  const HEX_SIZE = 40;
  const SVG_W = 700;
  const SVG_H = 500;

  const PIECE_EMOJI = { queen: '👑', beetle: '🪲', grasshopper: '🦗', spider: '🕷️', ant: '🐜' };
  const PIECE_NAME = { queen: 'Rainha', beetle: 'Besouro', grasshopper: 'Gafanhoto', spider: 'Aranha', ant: 'Formiga' };

  function hexToPixel(q, r) {
    const x = HEX_SIZE * (3/2 * q);
    const y = HEX_SIZE * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
    return { x, y };
  }

  function hexCorners(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i);
      pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
    }
    return pts.join(' ');
  }

  function init(el, playerId, playerName) {
    container = el;
    myPlayerId = playerId;
    myPlayerName = playerName;
  }

  function render(state, actionFn) {
    sendAction = actionFn;
    currentState = state;

    const isMyTurn = state.isMyTurn;
    const myPlayerIndex = state.myPlayerIndex;
    const me = state.players[myPlayerIndex];
    const currentPlayer = state.players[state.currentTurnIndex];

    container.innerHTML = `<div class="hive-wrapper">
      <div class="hive-info-bar">
        <div class="player-label ${state.currentTurnIndex === 0 ? 'active' : ''}">
          ⬜ ${esc(state.players[0]?.playerName)}${state.myPlayerIndex === 0 ? ' (você)' : ''}
        </div>
        <div class="player-label ${state.currentTurnIndex === 1 ? 'active' : ''}">
          ⬛ ${esc(state.players[1]?.playerName)}${state.myPlayerIndex === 1 ? ' (você)' : ''}
        </div>
      </div>
      <svg id="hiveSvg" class="hive-board-svg" width="${SVG_W}" height="${SVG_H}" viewBox="-${SVG_W/2} -${SVG_H/2} ${SVG_W} ${SVG_H}"></svg>
      <div class="hive-hand-panel" id="hiveHands"></div>
    </div>`;

    renderBoard(state);
    renderHands(state, isMyTurn, myPlayerIndex);
  }

  function renderBoard(state) {
    const svg = document.getElementById('hiveSvg');
    if (!svg) return;

    const board = state.board || {};

    // Collect all occupied + legal move positions
    const positions = new Set();
    const legalMoves = state.legalMoves || [];

    Object.keys(board).forEach(k => positions.add(k));
    legalMoves.forEach(m => {
      if (m.type === 'move' || m.type === 'place') {
        positions.add(`${m.q},${m.r},${m.s || -m.q - m.r}`);
      }
    });

    // Also add neighbors of occupied cells for visual context
    Object.keys(board).forEach(k => {
      const [q, r, s] = k.split(',').map(Number);
      [[-1,1,0],[1,-1,0],[1,0,-1],[-1,0,1],[0,1,-1],[0,-1,1]].forEach(([dq,dr,ds]) => {
        positions.add(`${q+dq},${r+dr},${s+ds}`);
      });
    });

    // Determine legal targets
    const legalTargets = new Set(legalMoves.map(m => `${m.q || m.toQ},${m.r || m.toR},${m.s !== undefined ? m.s : -(m.q || m.toQ)-(m.r || m.toR)}`));
    // Also handle move targets
    legalMoves.forEach(m => {
      if (m.type === 'move') legalTargets.add(`${m.toQ},${m.toR},${m.toS}`);
    });

    // Selected piece from/board
    let selectedKey = null;
    if (selectedPiece && selectedPiece.type === 'board') {
      selectedKey = `${selectedPiece.fromQ},${selectedPiece.fromR},${selectedPiece.fromS}`;
    }

    let svgContent = '';
    for (const posKey of positions) {
      const [q, r, s] = posKey.split(',').map(Number);
      const { x, y } = hexToPixel(q, r);
      const stack = board[posKey];
      const isOccupied = stack && stack.length > 0;
      const isLegal = legalTargets.has(posKey) && !isOccupied && currentState?.isMyTurn;
      const isSelected = posKey === selectedKey;

      let hexClass = 'hex-empty';
      let textContent = '';
      if (isSelected) hexClass = 'hex-selected';
      else if (isLegal) hexClass = 'hex-legal';
      else if (isOccupied) {
        const top = stack[stack.length - 1];
        hexClass = top.playerIndex === 0 ? 'hex-white' : 'hex-black';
        textContent = PIECE_EMOJI[top.piece] || top.piece[0].toUpperCase();
        if (stack.length > 1) textContent += `<tspan font-size="9" dy="8" dx="-6">${stack.length}</tspan>`;
      }

      svgContent += `<g class="hex-cell" data-q="${q}" data-r="${r}" data-s="${s}" data-occupied="${isOccupied}" data-legal="${isLegal}">
        <polygon class="${hexClass}" points="${hexCorners(x, y, HEX_SIZE - 2)}"/>
        ${textContent ? `<text class="hex-text" x="${x}" y="${y}">${textContent}</text>` : ''}
      </g>`;
    }

    svg.innerHTML = svgContent;

    // Attach click events
    svg.querySelectorAll('.hex-cell').forEach(g => {
      g.style.cursor = g.dataset.legal === 'true' || g.dataset.occupied === 'true' ? 'pointer' : 'default';
      g.addEventListener('click', () => {
        const q = parseInt(g.dataset.q);
        const r = parseInt(g.dataset.r);
        const s = parseInt(g.dataset.s);
        onHexClick(q, r, s, g.dataset.occupied === 'true', g.dataset.legal === 'true');
      });
    });
  }

  function renderHands(state, isMyTurn, myPlayerIndex) {
    const handsEl = document.getElementById('hiveHands');
    if (!handsEl) return;

    state.players.forEach((p, idx) => {
      const isMe = idx === myPlayerIndex;
      const hand = p.hand || {};
      const totalPieces = Object.values(hand).reduce((s, v) => s + v, 0);

      const panel = document.createElement('div');
      panel.className = 'hive-hand';
      panel.innerHTML = `<h3>${esc(p.playerName)} ${isMe ? '(você)' : ''} — ${p.color === 'white' ? '⬜' : '⬛'}</h3>
        <div class="pieces" id="hand_${idx}"></div>`;
      handsEl.appendChild(panel);

      const piecesEl = panel.querySelector('.pieces');
      if (totalPieces === 0) {
        piecesEl.innerHTML = '<span style="color:var(--muted);font-size:0.8rem">Sem peças na mão</span>';
        return;
      }

      Object.entries(hand).forEach(([piece, count]) => {
        if (count <= 0) return;
        const btn = document.createElement('button');
        const isSelected = selectedPiece?.type === 'hand' && selectedPiece?.piece === piece && idx === myPlayerIndex;
        btn.className = `hive-piece-btn ${p.color === 'white' ? 'white-piece' : 'black-piece'}${isSelected ? ' selected' : ''}`;
        btn.textContent = `${PIECE_EMOJI[piece] || piece} x${count}`;
        btn.title = PIECE_NAME[piece] || piece;
        btn.disabled = !isMyTurn || idx !== myPlayerIndex;
        btn.addEventListener('click', () => onHandPieceClick(piece, idx));
        piecesEl.appendChild(btn);
      });
    });
  }

  function onHandPieceClick(piece, playerIdx) {
    if (!currentState?.isMyTurn || playerIdx !== currentState.myPlayerIndex) return;

    if (selectedPiece?.type === 'hand' && selectedPiece.piece === piece) {
      selectedPiece = null;
    } else {
      selectedPiece = { type: 'hand', piece };
    }
    render(currentState, sendAction);
  }

  function onHexClick(q, r, s, isOccupied, isLegal) {
    if (!currentState?.isMyTurn) return;

    const posKey = `${q},${r},${s}`;
    const myPlayerIndex = currentState.myPlayerIndex;

    // Click on occupied hex — select piece to move
    if (isOccupied && !selectedPiece) {
      const stack = currentState.board[posKey];
      if (stack && stack[stack.length - 1].playerIndex === myPlayerIndex) {
        selectedPiece = { type: 'board', fromQ: q, fromR: r, fromS: s, piece: stack[stack.length - 1].piece };
        render(currentState, sendAction);
      }
      return;
    }

    // Click on legal hex — place or move
    if (isLegal && selectedPiece) {
      if (selectedPiece.type === 'hand') {
        sendAction({ type: 'place', piece: selectedPiece.piece, q, r, s });
      } else if (selectedPiece.type === 'board') {
        sendAction({ type: 'move', fromQ: selectedPiece.fromQ, fromR: selectedPiece.fromR, fromS: selectedPiece.fromS, toQ: q, toR: r, toS: s });
      }
      selectedPiece = null;
      return;
    }

    // Deselect
    if (selectedPiece) {
      selectedPiece = null;
      render(currentState, sendAction);
    }
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render };
})();
