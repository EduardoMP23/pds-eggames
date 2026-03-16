const minPlayers = 2;
const maxPlayers = 2;

// Cubic coordinates: q, r, s where q+r+s=0
const DIRECTIONS = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1],
  [-1, 1, 0], [-1, 0, 1], [0, -1, 1]
];

function key(q, r, s) { return `${q},${r},${s}`; }
function parseKey(k) { const [q, r, s] = k.split(',').map(Number); return { q, r, s }; }

function neighbors(q, r, s) {
  return DIRECTIONS.map(([dq, dr, ds]) => ({ q: q + dq, r: r + dr, s: s + ds }));
}

function initState(players) {
  return {
    board: {}, // key -> [{piece, playerId, playerIndex}]  (stack for beetle)
    players: [
      { playerId: players[0].playerId, playerName: players[0].playerName, color: 'white', queenPlaced: false,
        hand: { queen: 1, beetle: 2, grasshopper: 3, spider: 2, ant: 3 } },
      { playerId: players[1].playerId, playerName: players[1].playerName, color: 'black', queenPlaced: false,
        hand: { queen: 1, beetle: 2, grasshopper: 3, spider: 2, ant: 3 } }
    ],
    currentTurnIndex: 0,
    moveNumber: 0,
    status: 'playing',
    winner: null
  };
}

function currentPlayer(state) { return state.players[state.currentTurnIndex]; }

function getBoardMap(state) {
  // Convert board object to Map for easier use
  const m = new Map();
  for (const [k, v] of Object.entries(state.board)) {
    m.set(k, v);
  }
  return m;
}

function isConnected(board, excludeKey) {
  const allKeys = [...board.keys()].filter(k => k !== excludeKey);
  if (allKeys.length === 0) return true;

  const visited = new Set();
  const start = allKeys[0];
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const cur = queue.shift();
    const { q, r, s } = parseKey(cur);
    for (const nb of neighbors(q, r, s)) {
      const nk = key(nb.q, nb.r, nb.s);
      if (!visited.has(nk) && board.has(nk) && nk !== excludeKey) {
        visited.add(nk);
        queue.push(nk);
      }
    }
  }

  return visited.size === allKeys.length;
}

function canSlide(board, fromQ, fromR, fromS, toQ, toR, toS) {
  // Check if sliding from one hex to an adjacent hex is physically possible (gate rule)
  const dq = toQ - fromQ, dr = toR - fromR, ds = toS - fromS;
  const dirIdx = DIRECTIONS.findIndex(([dq2, dr2, ds2]) => dq2 === dq && dr2 === dr && ds2 === ds);
  if (dirIdx === -1) return false;

  const left = DIRECTIONS[(dirIdx + 5) % 6];
  const right = DIRECTIONS[(dirIdx + 1) % 6];
  const leftKey = key(fromQ + left[0], fromR + left[1], fromS + left[2]);
  const rightKey = key(fromQ + right[0], fromR + right[1], fromS + right[2]);
  // Gate: both sides are occupied
  return !(board.has(leftKey) && board.has(rightKey));
}

function getQueenMoves(board, fromQ, fromR, fromS) {
  const moves = [];
  for (const { q, r, s } of neighbors(fromQ, fromR, fromS)) {
    const k = key(q, r, s);
    if (board.has(k)) continue;
    if (!canSlide(board, fromQ, fromR, fromS, q, r, s)) continue;
    // Must remain connected
    const testBoard = new Map(board);
    testBoard.delete(key(fromQ, fromR, fromS));
    testBoard.set(k, [{}]);
    if (isConnected(testBoard, null)) moves.push({ q, r, s });
  }
  return moves;
}

function getBeetleMoves(board, fromQ, fromR, fromS) {
  const moves = [];
  for (const { q, r, s } of neighbors(fromQ, fromR, fromS)) {
    const testBoard = new Map(board);
    testBoard.delete(key(fromQ, fromR, fromS));
    if (!isConnected(testBoard, null)) continue;
    // Beetles can move onto other pieces (stack)
    moves.push({ q, r, s });
  }
  return moves;
}

function getGrasshopperMoves(board, fromQ, fromR, fromS) {
  const moves = [];
  for (const [dq, dr, ds] of DIRECTIONS) {
    let q = fromQ + dq, r = fromR + dr, s = fromS + ds;
    if (!board.has(key(q, r, s))) continue; // Must jump over at least one
    while (board.has(key(q, r, s))) {
      q += dq; r += dr; s += ds;
    }
    moves.push({ q, r, s });
  }
  return moves;
}

function getSpiderMoves(board, fromQ, fromR, fromS, fromStack) {
  // Spider moves exactly 3 steps, no backtracking, must stay connected
  const moves = new Set();
  const tempBoard = new Map(board);
  if (fromStack.length <= 1) tempBoard.delete(key(fromQ, fromR, fromS));

  function dfs(q, r, s, steps, visited) {
    if (steps === 3) {
      const k = key(q, r, s);
      if (!board.has(k)) moves.add(k);
      return;
    }
    for (const nb of neighbors(q, r, s)) {
      const nk = key(nb.q, nb.r, nb.s);
      if (visited.has(nk)) continue;
      if (!tempBoard.has(nk) && !board.has(nk)) continue;
      if (tempBoard.has(nk) && steps < 2) continue; // Can't walk on occupied (except final?)
      // Actually spider walks on the edge of the hive, not through it
      // Must be adjacent to hive and not move to occupied
      if (board.has(nk) && !(steps === 2)) continue;
      if (!canSlide(tempBoard, q, r, s, nb.q, nb.r, nb.s)) continue;
      // Must remain connected to hive
      const adjToHive = neighbors(nb.q, nb.r, nb.s).some(n => {
        const nk2 = key(n.q, n.r, n.s);
        return tempBoard.has(nk2) && nk2 !== key(q, r, s);
      });
      if (!adjToHive && steps < 2) continue;
      visited.add(nk);
      dfs(nb.q, nb.r, nb.s, steps + 1, visited);
      visited.delete(nk);
    }
  }

  dfs(fromQ, fromR, fromS, 0, new Set([key(fromQ, fromR, fromS)]));
  return [...moves].map(k => parseKey(k));
}

function getAntMoves(board, fromQ, fromR, fromS) {
  const moves = new Set();
  const tempBoard = new Map(board);
  if ((board.get(key(fromQ, fromR, fromS)) || []).length <= 1) {
    tempBoard.delete(key(fromQ, fromR, fromS));
  }

  const queue = [{ q: fromQ, r: fromR, s: fromS }];
  const visited = new Set([key(fromQ, fromR, fromS)]);

  while (queue.length > 0) {
    const { q, r, s } = queue.shift();
    for (const nb of neighbors(q, r, s)) {
      const nk = key(nb.q, nb.r, nb.s);
      if (visited.has(nk)) continue;
      if (board.has(nk)) continue; // Can't land on occupied
      // Must be adjacent to hive
      const adjToHive = neighbors(nb.q, nb.r, nb.s).some(n => tempBoard.has(key(n.q, n.r, n.s)));
      if (!adjToHive) continue;
      if (!canSlide(tempBoard, q, r, s, nb.q, nb.r, nb.s)) continue;
      visited.add(nk);
      moves.add(nk);
      queue.push(nb);
    }
  }

  const from = key(fromQ, fromR, fromS);
  return [...moves].filter(k => k !== from).map(k => parseKey(k));
}

function getLegalMoves(state, playerIndex) {
  const board = getBoardMap(state);
  const player = state.players[playerIndex];
  const moves = [];

  // Placements
  const boardPieceCount = [...board.values()].reduce((s, v) => s + v.length, 0);
  if (boardPieceCount === 0) {
    // First piece anywhere
    Object.keys(player.hand).forEach(piece => {
      if (player.hand[piece] > 0) moves.push({ type: 'place', piece, q: 0, r: 0, s: 0 });
    });
    return moves;
  }

  // After 4th move, must have placed queen
  const myPiecesOnBoard = [...board.values()].flat().filter(p => p.playerIndex === playerIndex).length;
  const mustPlaceQueen = !player.queenPlaced && myPiecesOnBoard >= 3;

  const validPlacementSpots = getPlacementSpots(board, playerIndex);

  if (mustPlaceQueen) {
    if (player.hand.queen > 0) {
      validPlacementSpots.forEach(({ q, r, s }) => {
        moves.push({ type: 'place', piece: 'queen', q, r, s });
      });
    }
    return moves;
  }

  // Placements
  Object.keys(player.hand).forEach(piece => {
    if (player.hand[piece] > 0) {
      validPlacementSpots.forEach(({ q, r, s }) => {
        moves.push({ type: 'place', piece, q, r, s });
      });
    }
  });

  // Movements (only if queen placed)
  if (player.queenPlaced) {
    for (const [k, stack] of board.entries()) {
      const top = stack[stack.length - 1];
      if (top.playerIndex !== playerIndex) continue;

      const { q, r, s } = parseKey(k);
      const testBoard = new Map(board);
      const stackCopy = [...stack];
      stackCopy.pop();
      if (stackCopy.length === 0) testBoard.delete(k);
      else testBoard.set(k, stackCopy);

      if (!isConnected(testBoard, null)) continue; // Would break hive

      let pieceMoves = [];
      const piece = top.piece;
      if (piece === 'queen') pieceMoves = getQueenMoves(board, q, r, s);
      else if (piece === 'beetle') pieceMoves = getBeetleMoves(board, q, r, s);
      else if (piece === 'grasshopper') pieceMoves = getGrasshopperMoves(board, q, r, s);
      else if (piece === 'spider') pieceMoves = getSpiderMoves(board, q, r, s, stack);
      else if (piece === 'ant') pieceMoves = getAntMoves(board, q, r, s);

      pieceMoves.forEach(({ q: tq, r: tr, s: ts }) => {
        moves.push({ type: 'move', fromQ: q, fromR: r, fromS: s, toQ: tq, toR: tr, toS: ts, piece });
      });
    }
  }

  return moves;
}

function getPlacementSpots(board, playerIndex) {
  if (board.size === 0) return [{ q: 0, r: 0, s: 0 }];
  if (board.size === 1) {
    const [k] = board.keys();
    const { q, r, s } = parseKey(k);
    return neighbors(q, r, s);
  }

  const spots = new Set();
  for (const [k, stack] of board.entries()) {
    if (stack[stack.length - 1].playerIndex !== playerIndex) continue;
    const { q, r, s } = parseKey(k);
    for (const nb of neighbors(q, r, s)) {
      const nk = key(nb.q, nb.r, nb.s);
      if (board.has(nk)) continue;
      // No adjacent enemy pieces
      const hasEnemyAdj = neighbors(nb.q, nb.r, nb.s).some(n => {
        const ek = key(n.q, n.r, n.s);
        if (ek === k) return false;
        const s2 = board.get(ek);
        return s2 && s2[s2.length - 1].playerIndex !== playerIndex;
      });
      if (!hasEnemyAdj) spots.add(nk);
    }
  }
  return [...spots].map(k => parseKey(k));
}

function checkQueenSurrounded(board, playerIndex) {
  for (const [k, stack] of board.entries()) {
    const top = stack[stack.length - 1];
    if (top.playerIndex === playerIndex && top.piece === 'queen') {
      const { q, r, s } = parseKey(k);
      const allNeighborsFilled = neighbors(q, r, s).every(nb => board.has(key(nb.q, nb.r, nb.s)));
      return allNeighborsFilled;
    }
  }
  return false;
}

function applyAction(state, action, playerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) return { error: 'Player not found' };
  if (state.currentTurnIndex !== playerIndex) return { error: 'Not your turn' };

  const board = getBoardMap(state);
  const player = state.players[playerIndex];
  const events = [];

  if (action.type === 'place') {
    const { piece, q, r, s } = action;
    if (!player.hand[piece] || player.hand[piece] <= 0) return { error: 'No such piece in hand' };

    // Validate placement
    const legalMoves = getLegalMoves(state, playerIndex);
    const isLegal = legalMoves.some(m => m.type === 'place' && m.piece === piece && m.q === q && m.r === r && m.s === s);
    if (!isLegal) return { error: 'Illegal placement' };

    player.hand[piece]--;
    if (piece === 'queen') player.queenPlaced = true;

    const k = key(q, r, s);
    if (!state.board[k]) state.board[k] = [];
    state.board[k].push({ piece, playerIndex, playerId });
    events.push(`${player.playerName} places ${piece} at (${q},${r},${s})`);
  } else if (action.type === 'move') {
    const { fromQ, fromR, fromS, toQ, toR, toS } = action;

    const legalMoves = getLegalMoves(state, playerIndex);
    const isLegal = legalMoves.some(m => m.type === 'move' && m.fromQ === fromQ && m.fromR === fromR && m.fromS === fromS && m.toQ === toQ && m.toR === toR && m.toS === toS);
    if (!isLegal) return { error: 'Illegal move' };

    const fromK = key(fromQ, fromR, fromS);
    const toK = key(toQ, toR, toS);
    const piece = state.board[fromK].pop();
    if (state.board[fromK].length === 0) delete state.board[fromK];
    if (!state.board[toK]) state.board[toK] = [];
    state.board[toK].push(piece);
    events.push(`${player.playerName} moves ${piece.piece} to (${toQ},${toR},${toS})`);
  } else {
    return { error: 'Unknown action type' };
  }

  const updatedBoard = getBoardMap(state);

  // Check win conditions
  const p0Surrounded = checkQueenSurrounded(updatedBoard, 0);
  const p1Surrounded = checkQueenSurrounded(updatedBoard, 1);

  if (p0Surrounded && p1Surrounded) {
    state.status = 'draw';
    events.push('Draw! Both queens are surrounded!');
    return { events, gameOver: true, winner: null, reason: 'draw' };
  }
  if (p0Surrounded) {
    state.status = 'finished';
    state.winner = state.players[1].playerId;
    events.push(`${state.players[1].playerName} wins! White queen is surrounded!`);
    return { events, gameOver: true, winner: state.players[1].playerId, winnerName: state.players[1].playerName };
  }
  if (p1Surrounded) {
    state.status = 'finished';
    state.winner = state.players[0].playerId;
    events.push(`${state.players[0].playerName} wins! Black queen is surrounded!`);
    return { events, gameOver: true, winner: state.players[0].playerId, winnerName: state.players[0].playerName };
  }

  state.currentTurnIndex = 1 - state.currentTurnIndex;
  state.moveNumber++;
  return { events };
}

function getPublicState(state, forPlayerId) {
  const playerIndex = state.players.findIndex(p => p.playerId === forPlayerId);
  const legalMoves = state.status === 'playing' && playerIndex === state.currentTurnIndex
    ? getLegalMoves(state, playerIndex)
    : [];

  return {
    board: state.board,
    players: state.players.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      color: p.color,
      queenPlaced: p.queenPlaced,
      hand: p.hand
    })),
    currentTurnIndex: state.currentTurnIndex,
    currentTurnPlayerId: state.players[state.currentTurnIndex]?.playerId,
    isMyTurn: state.players[state.currentTurnIndex]?.playerId === forPlayerId,
    myPlayerIndex: playerIndex,
    moveNumber: state.moveNumber,
    status: state.status,
    winner: state.winner,
    legalMoves
  };
}

module.exports = { minPlayers, maxPlayers, initState, applyAction, getPublicState };
