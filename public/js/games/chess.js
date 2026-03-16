(function () {
  let container, myPlayerId, myPlayerName;
  let selectedSquare = null;
  let legalMovesForSelected = [];
  let currentState = null;
  let pendingPromotion = null;
  let sendAction = null;

  const PIECE_UNICODE = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
  };

  function parseFEN(fen) {
    const ranks = fen.split(' ')[0].split('/');
    const board = [];
    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      const row = [];
      for (const ch of ranks[rankIdx]) {
        if (isNaN(ch)) {
          row.push(ch);
        } else {
          for (let i = 0; i < parseInt(ch); i++) row.push(null);
        }
      }
      board.push(row);
    }
    return board;
  }

  function squareToRC(sq) {
    const file = sq.charCodeAt(0) - 97; // a=0
    const rank = 8 - parseInt(sq[1]);    // 8=0, 1=7
    return { row: rank, col: file };
  }

  function rcToSquare(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  function init(el, playerId, playerName) {
    container = el;
    myPlayerId = playerId;
    myPlayerName = playerName;
  }

  function render(state, actionFn) {
    sendAction = actionFn;
    currentState = state;

    const flipped = state.myColor === 'b';
    const board = parseFEN(state.fen);

    container.innerHTML = `
      <div class="chess-wrapper">
        <div class="chess-info-bar">
          <div class="player-label ${state.turn === 'w' ? 'active' : ''}">
            ♔ ${esc(state.playerNames?.w || 'Brancas')} ${state.myColor === 'w' ? '(você)' : ''}
          </div>
          <div class="player-label ${state.turn === 'b' ? 'active' : ''}">
            ♚ ${esc(state.playerNames?.b || 'Pretas')} ${state.myColor === 'b' ? '(você)' : ''}
          </div>
        </div>
        <div class="board-container">
          <div class="chess-board" id="chessBoard"></div>
        </div>
        <div class="coords-file" id="coordsFile"></div>
        <div id="chessStatus" style="font-size:0.9rem;color:var(--muted);text-align:center"></div>
      </div>
    `;

    const boardEl = document.getElementById('chessBoard');
    const files = ['a','b','c','d','e','f','g','h'];
    const coordsEl = document.getElementById('coordsFile');

    const displayFiles = flipped ? [...files].reverse() : files;
    coordsEl.innerHTML = displayFiles.map(f => `<span>${f}</span>`).join('');

    const rows = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const cols = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

    for (const row of rows) {
      for (const col of cols) {
        const sq = rcToSquare(row, col);
        const piece = board[row][col];
        const isLight = (row + col) % 2 === 0;

        const cell = document.createElement('div');
        cell.className = 'chess-cell ' + (isLight ? 'light' : 'dark');
        cell.dataset.sq = sq;

        if (piece) {
          const color = piece === piece.toUpperCase() ? 'w' : 'b';
          const key = color + piece.toUpperCase();
          cell.textContent = PIECE_UNICODE[key] || piece;
        }

        // Highlight last move
        if (state.lastMove && (sq === state.lastMove.from || sq === state.lastMove.to)) {
          cell.classList.add('last-move');
        }

        // Highlight selected
        if (selectedSquare === sq) {
          cell.classList.add('selected');
        }

        // Highlight legal moves
        const lm = legalMovesForSelected.find(m => m.to === sq);
        if (lm) {
          if (board[row][col]) cell.classList.add('legal-capture');
          else cell.classList.add('legal-move');
        }

        cell.addEventListener('click', () => onCellClick(sq, piece));
        boardEl.appendChild(cell);
      }
    }

    // Players panel
    const pp = document.getElementById('playersPanel');
    if (pp) {
      pp.innerHTML = `<h3>Jogadores</h3>
        <div style="font-size:0.85rem;margin-top:0.25rem">
          <div style="color:${state.turn==='w'?'var(--accent)':'var(--muted)'}">♔ ${esc(state.playerNames?.w||'')}</div>
          <div style="color:${state.turn==='b'?'var(--accent)':'var(--muted)'}">♚ ${esc(state.playerNames?.b||'')}</div>
        </div>`;
    }

    // Status
    const statusEl = document.getElementById('chessStatus');
    if (state.status === 'playing') {
      statusEl.textContent = state.isMyTurn ? 'Sua vez de jogar' : 'Aguardando adversário...';
    } else {
      statusEl.textContent = state.status === 'draw' ? 'Empate!' : 'Fim de jogo';
    }
  }

  function onCellClick(sq, piece) {
    if (!currentState || !currentState.isMyTurn) return;

    // If a square is already selected and this is a legal move destination
    if (selectedSquare && legalMovesForSelected.some(m => m.to === sq)) {
      const move = legalMovesForSelected.find(m => m.to === sq);

      // Check promotion
      if (move.flags && move.flags.includes('p')) {
        pendingPromotion = { from: selectedSquare, to: sq };
        showPromotionModal();
        return;
      }

      sendAction({ type: 'move', from: selectedSquare, to: sq });
      selectedSquare = null;
      legalMovesForSelected = [];
      render(currentState, sendAction);
      return;
    }

    // Select a piece
    const myColor = currentState.myColor;
    const board = parseFEN(currentState.fen);
    const { row, col } = squareToRC(sq);
    const p = board[row][col];

    if (p && ((p === p.toUpperCase()) === (myColor === 'w'))) {
      selectedSquare = sq;
      legalMovesForSelected = (currentState.legalMoves || []).filter(m => m.from === sq);
    } else {
      selectedSquare = null;
      legalMovesForSelected = [];
    }
    render(currentState, sendAction);
  }

  function showPromotionModal() {
    const existing = document.getElementById('promotionModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'promotionModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal promotion-modal">
        <h2>Promoção de Peão</h2>
        <p style="color:var(--muted);font-size:0.875rem;margin-bottom:0.5rem">Escolha a peça:</p>
        <div class="piece-choices">
          ${currentState.myColor === 'w'
            ? '<span class="piece-choice" data-p="q">♕</span><span class="piece-choice" data-p="r">♖</span><span class="piece-choice" data-p="b">♗</span><span class="piece-choice" data-p="n">♘</span>'
            : '<span class="piece-choice" data-p="q">♛</span><span class="piece-choice" data-p="r">♜</span><span class="piece-choice" data-p="b">♝</span><span class="piece-choice" data-p="n">♞</span>'
          }
        </div>
      </div>
    `;
    modal.querySelectorAll('.piece-choice').forEach(el => {
      el.addEventListener('click', () => {
        const promotion = el.dataset.p;
        sendAction({ type: 'move', from: pendingPromotion.from, to: pendingPromotion.to, promotion });
        pendingPromotion = null;
        selectedSquare = null;
        legalMovesForSelected = [];
        modal.remove();
      });
    });
    document.body.appendChild(modal);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render };
})();
