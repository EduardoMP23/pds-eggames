'use strict';

/**
 * HiveBoard — pure hex-grid utilities.
 *
 * Uses cubic coordinates (q, r, s) where q + r + s = 0.
 * No I/O, no side-effects — safe to call from any layer.
 */

const DIRECTIONS = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1],
  [-1, 1, 0], [-1, 0, 1], [0, -1, 1]
];

/** @returns {string} */
function key(q, r, s) {
  return `${q},${r},${s}`;
}

/** @returns {{ q: number, r: number, s: number }} */
function parseKey(k) {
  const [q, r, s] = k.split(',').map(Number);
  return { q, r, s };
}

/** @returns {{ q: number, r: number, s: number }[]} */
function neighbors(q, r, s) {
  return DIRECTIONS.map(([dq, dr, ds]) => ({ q: q + dq, r: r + dr, s: s + ds }));
}

/**
 * Converts a plain-object board (JSON-serialisable) to a Map for algorithm use.
 * @param {Object} boardObj
 * @returns {Map<string, Array>}
 */
function toBoardMap(boardObj) {
  const m = new Map();
  for (const [k, v] of Object.entries(boardObj)) {
    m.set(k, v);
  }
  return m;
}

/**
 * BFS connectivity check — returns true if all occupied hexes form one component.
 * @param {Map} board
 * @param {string|null} excludeKey  hex to treat as empty (the piece being lifted)
 */
function isConnected(board, excludeKey) {
  const allKeys = [...board.keys()].filter(k => k !== excludeKey);
  if (allKeys.length <= 1) return true;

  const visited = new Set([allKeys[0]]);
  const queue = [allKeys[0]];

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

/**
 * Gate rule: a piece can slide between two adjacent hexes only when the two
 * flanking hexes are not both occupied at the same time.
 * @returns {boolean}
 */
function canSlide(board, fromQ, fromR, fromS, toQ, toR, toS) {
  const dq = toQ - fromQ;
  const dr = toR - fromR;
  const ds = toS - fromS;
  const dirIdx = DIRECTIONS.findIndex(([dq2, dr2, ds2]) => dq2 === dq && dr2 === dr && ds2 === ds);
  if (dirIdx === -1) return false;

  const left = DIRECTIONS[(dirIdx + 5) % 6];
  const right = DIRECTIONS[(dirIdx + 1) % 6];
  const leftKey = key(fromQ + left[0], fromR + left[1], fromS + left[2]);
  const rightKey = key(fromQ + right[0], fromR + right[1], fromS + right[2]);
  return !(board.has(leftKey) && board.has(rightKey));
}

module.exports = { DIRECTIONS, key, parseKey, neighbors, toBoardMap, isConnected, canSlide };
