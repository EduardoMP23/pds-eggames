'use strict';

const { Router } = require('express');

/**
 * HttpRoutes — inbound adapter for REST API endpoints.
 *
 * Translates HTTP requests into calls on RoomService and serialises the
 * responses.  No business logic lives here.
 */
class HttpRoutes {
  /**
   * @param {import('../../application/RoomService')} roomService
   */
  constructor(roomService) {
    this._rooms = roomService;
  }

  /** @returns {import('express').Router} */
  router() {
    const r = Router();

    r.get('/rooms', (req, res) => {
      res.json(this._rooms.listPublicRooms());
    });

    r.get('/room/:id', (req, res) => {
      const room = this._rooms.getRoom(req.params.id);
      if (!room) return res.status(404).json({ error: 'Room not found' });
      res.json({
        roomId:     room.roomId,
        gameId:     room.gameId,
        status:     room.status,
        players:    room.players.map(p => ({
          playerId:   p.playerId,
          playerName: p.playerName,
          connected:  p.connected
        })),
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers
      });
    });

    return r;
  }
}

module.exports = HttpRoutes;
