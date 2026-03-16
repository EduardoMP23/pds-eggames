const chess = require('./games/chess/logic');
const explodingKittens = require('./games/explodingKittens/logic');
const coup = require('./games/coup/logic');
const hive = require('./games/hive/logic');

const registry = {
  chess,
  explodingKittens,
  coup,
  hive
};

function getGame(gameId) {
  return registry[gameId] || null;
}

module.exports = { getGame };
