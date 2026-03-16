const { Chess } = require('chess.js');

const minPlayers = 2;
const maxPlayers = 2;

function initState(players) {
  const chess = new Chess();
  return {
    fen: chess.fen(),
    turn: 'w',
    players: {
      w: players[0].playerId,
      b: players[1].playerId
    },
    playerNames: {
      w: players[0].playerName,
      b: players[1].playerName
    },
    status: 'playing',
    winner: null,
    lastMove: null,
    _chess: chess
  };
}

function applyAction(state, action, playerId) {
  const chess = state._chess;
  const events = [];

  if (action.type !== 'move') return { error: 'Invalid action type' };

  const currentColor = chess.turn();
  if (state.players[currentColor] !== playerId) {
    return { error: 'Not your turn' };
  }

  let move;
  try {
    move = chess.move({ from: action.from, to: action.to, promotion: action.promotion || 'q' });
  } catch (e) {
    return { error: 'Illegal move' };
  }

  if (!move) return { error: 'Illegal move' };

  state.fen = chess.fen();
  state.turn = chess.turn();
  state.lastMove = { from: move.from, to: move.to, san: move.san, flags: move.flags };

  const moverName = state.playerNames[currentColor];
  events.push(`${moverName} played ${move.san}`);

  if (chess.isCheck()) events.push('Check!');

  if (chess.isGameOver()) {
    state.status = 'finished';
    if (chess.isCheckmate()) {
      state.winner = playerId;
      const winnerColor = currentColor;
      events.push(`Checkmate! ${moverName} wins!`);
      return { events, gameOver: true, winner: playerId, winnerName: moverName, reason: 'checkmate' };
    } else {
      state.status = 'draw';
      const reason = chess.isStalemate() ? 'stalemate'
        : chess.isThreefoldRepetition() ? 'threefold repetition'
        : chess.isInsufficientMaterial() ? 'insufficient material'
        : 'draw';
      events.push(`Draw by ${reason}`);
      return { events, gameOver: true, winner: null, reason };
    }
  }

  return { events };
}

function getPublicState(state, forPlayerId) {
  const myColor = state.players.w === forPlayerId ? 'w' : state.players.b === forPlayerId ? 'b' : null;
  return {
    fen: state.fen,
    turn: state.turn,
    myColor,
    players: state.playerNames,
    playerIds: state.players,
    status: state.status,
    winner: state.winner,
    lastMove: state.lastMove,
    isMyTurn: state.players[state.turn] === forPlayerId,
    legalMoves: myColor && state.turn === myColor ? state._chess.moves({ verbose: true }) : []
  };
}

module.exports = { minPlayers, maxPlayers, initState, applyAction, getPublicState };
