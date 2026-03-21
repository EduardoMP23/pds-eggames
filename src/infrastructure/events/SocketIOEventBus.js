'use strict';

/**
 * SocketIOEventBus — implements EventBusPort using Socket.io.
 *
 * This adapter translates domain/application events into Socket.io emissions.
 * It knows nothing about game rules — only how to send messages.
 */
class SocketIOEventBus {
  /**
   * @param {import('socket.io').Server} io
   */
  constructor(io) {
    this._io = io;
  }

  // ── EventBusPort implementation ────────────────────────────────────────────

  /** Emit to every socket in the room. */
  toRoom(roomId, event, data) {
    this._io.to(roomId).emit(event, data);
  }

  /** Emit to one specific socket. */
  toSocket(socketId, event, data) {
    const socket = this._io.sockets.sockets.get(socketId);
    if (socket) socket.emit(event, data);
  }

  /**
   * Deliver a personalised game-state update to each connected player.
   *
   * @param {Object}                     room         room object from the repository
   * @param {(playerId: string) => any}  getStateFn   returns the state for a given player
   */
  broadcastGameState(room, getStateFn) {
    room.players
      .filter(p => p.connected)
      .forEach(p => this.toSocket(p.socketId, 'game:state-update', getStateFn(p.playerId)));
  }
}

module.exports = SocketIOEventBus;
