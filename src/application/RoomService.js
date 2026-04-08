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
  createRoom(socketId, playerName, gameId, minPlayers, maxPlayers) {
    return this._repo.createRoom(socketId, playerName, gameId, minPlayers, maxPlayers);
  }

  /** Join or reconnect to an existing room. Returns { room, playerId, reconnected } or { error }. */
  joinRoom(socketId, playerName, roomId) {
    return this._repo.joinRoom(socketId, playerName, roomId);
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
    const result = this._repo.removePlayer(socketId);
    if (result) this._repo.reassignHost(result.roomId);
    return result;
  }

  /** @returns {Object[]} */
  listPublicRooms() {
    return this._repo.listPublicRooms();
  }
}

module.exports = RoomService;
