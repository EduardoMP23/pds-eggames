'use strict';

/**
 * RoomService — application use-cases for room lifecycle management.
 *
 * Orchestrates the RoomRepositoryPort; never talks to sockets or HTTP directly.
 * All side-effects (persistence) are delegated to the injected repository.
 */
class RoomService {
  /**
   * @param {import('./ports/RoomRepositoryPort')} roomRepository
   */
  constructor(roomRepository) {
    this._repo = roomRepository;
  }

  /** Create a new room and return { room, playerId }. */
  createRoom(socketId, playerName, gameId, minPlayers, maxPlayers, avatar, color) {
    return this._repo.createRoom(socketId, playerName, gameId, minPlayers, maxPlayers, avatar, color);
  }

  /** Join or reconnect to an existing room. Returns { room, playerId, reconnected } or { error }. */
  joinRoom(socketId, playerName, roomId, avatar, color, playerId) {
    return this._repo.joinRoom(socketId, playerName, roomId, avatar, color, playerId);
  }

  /** @returns {Object|null} */
  getRoom(roomId) {
    return this._repo.getRoom(roomId);
  }

  /** @returns {{ roomId, playerId, playerName }|null} */
  getPlayerInfo(socketId) {
    return this._repo.getPlayerInfo(socketId);
  }

  /**
   * Mark a player as disconnected, reassign host if necessary, and schedule
   * room cleanup.
   * @returns {{ roomId, playerId, removed, room }|null}
   */
  removePlayer(socketId) {
    return this._repo.removePlayer(socketId);
  }

  /** Reassign host to the next connected player. Called by SocketHandler after the grace-period timer fires. */
  reassignHost(roomId) {
    this._repo.reassignHost(roomId);
  }

  /** @returns {Object[]} */
  listPublicRooms() {
    return this._repo.listPublicRooms();
  }
}

module.exports = RoomService;
