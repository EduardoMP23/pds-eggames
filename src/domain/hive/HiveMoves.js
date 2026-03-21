'use strict';

/**
 * HiveMoves — pure move-generation algorithms for each piece type.
 *
 * All functions receive a board Map and return an array of valid destinations.
 * No I/O, no side-effects.
 */

const { DIRECTIONS, key, parseKey, neighbors, toBoardMap, isConnected, canSlide } = require('./HiveBoard');

// ── Per-piece movement ────────────────────────────────────────────────────────

function getQueenMoves(board, fromQ, fromR, fromS) {
  const moves = [];
  for (const { q, r, s } of neighbors(fromQ, fromR, fromS)) {
    if (board.has(key(q, r, s))) continue;
    if (!canSlide(board, fromQ, fromR, fromS, q, r, s)) continue;
    // Verify the hive stays connected after the slide
    const testBoard = new Map(board);
    testBoard.delete(key(fromQ, fromR, fromS));
    testBoard.set(key(q, r, s), [{}]);
    if (isConnected(testBoard, null)) moves.push({ q, r, s });
  }
  return moves;
}

function getBeetleMoves(board, fromQ, fromR, fromS) {
  const moves = [];
  for (const { q, r, s } of neighbors(fromQ, fromR, fromS)) {
    // Beetle may climb onto occupied hexes — just check hive stays connected
    const testBoard = new Map(board);
    testBoard.delete(key(fromQ, fromR, fromS));
    if (!isConnected(testBoard, null)) continue;
    moves.push({ q, r, s });
  }
  return moves;
}

function getGrasshopperMoves(board, fromQ, fromR, fromS) {
  const moves = [];
  for (const [dq, dr, ds] of DIRECTIONS) {
    let q = fromQ + dq, r = fromR + dr, s = fromS + ds;
    if (!board.has(key(q, r, s))) continue; // must jump over at least one piece
    while (board.has(key(q, r, s))) { q += dq; r += dr; s += ds; }
    moves.push({ q, r, s });
  }
  return moves;
}

function getSpiderMoves(board, fromQ, fromR, fromS, fromStack) {
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
      if (tempBoard.has(nk) && steps < 2) continue;
      if (board.has(nk) && steps !== 2) continue;
      if (!canSlide(tempBoard, q, r, s, nb.q, nb.r, nb.s)) continue;
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
      if (visited.has(nk) || board.has(nk)) continue;
      if (!neighbors(nb.q, nb.r, nb.s).some(n => tempBoard.has(key(n.q, n.r, n.s)))) continue;
      if (!canSlide(tempBoard, q, r, s, nb.q, nb.r, nb.s)) continue;
      visited.add(nk);
      moves.add(nk);
      queue.push(nb);
    }
  }

  const fromK = key(fromQ, fromR, fromS);
  return [...moves].filter(k => k !== fromK).map(k => parseKey(k));
}

// ── Placement ─────────────────────────────────────────────────────────────────

/**
 * Returns all empty hexes where the current player may legally place a piece.
 * @param {Map} board
 * @param {number} playerIndex
 * @returns {{ q: number, r: number, s: number }[]}
 */
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

// ── Full legal-move enumeration ───────────────────────────────────────────────

/**
 * Returns every legal move (place + move) for the given player.
 * @param {Object} state  plain game-state object
 * @param {number} playerIndex
 * @returns {Array}
 */
function getLegalMoves(state, playerIndex) {
  const board = toBoardMap(state.board);
  const player = state.players[playerIndex];
  const moves = [];

  const boardPieceCount = [...board.values()].reduce((s, v) => s + v.length, 0);
  if (boardPieceCount === 0) {
    Object.keys(player.hand).forEach(piece => {
      if (player.hand[piece] > 0) moves.push({ type: 'place', piece, q: 0, r: 0, s: 0 });
    });
    return moves;
  }

  const myPiecesOnBoard = [...board.values()].flat().filter(p => p.playerIndex === playerIndex).length;
  const mustPlaceQueen = !player.queenPlaced && myPiecesOnBoard >= 3;
  const validSpots = getPlacementSpots(board, playerIndex);

  if (mustPlaceQueen) {
    if (player.hand.queen > 0) {
      validSpots.forEach(({ q, r, s }) => moves.push({ type: 'place', piece: 'queen', q, r, s }));
    }
    return moves;
  }

  Object.keys(player.hand).forEach(piece => {
    if (player.hand[piece] > 0) {
      validSpots.forEach(({ q, r, s }) => moves.push({ type: 'place', piece, q, r, s }));
    }
  });

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
      if (!isConnected(testBoard, null)) continue;

      let pieceMoves = [];
      if (top.piece === 'queen')       pieceMoves = getQueenMoves(board, q, r, s);
      else if (top.piece === 'beetle') pieceMoves = getBeetleMoves(board, q, r, s);
      else if (top.piece === 'grasshopper') pieceMoves = getGrasshopperMoves(board, q, r, s);
      else if (top.piece === 'spider') pieceMoves = getSpiderMoves(board, q, r, s, stack);
      else if (top.piece === 'ant')    pieceMoves = getAntMoves(board, q, r, s);

      pieceMoves.forEach(({ q: tq, r: tr, s: ts }) => {
        moves.push({ type: 'move', fromQ: q, fromR: r, fromS: s, toQ: tq, toR: tr, toS: ts, piece: top.piece });
      });
    }
  }

  return moves;
}

module.exports = { getLegalMoves, getPlacementSpots };
