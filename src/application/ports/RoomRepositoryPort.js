'use strict';

/**
 * RoomRepositoryPort — output port for room persistence.
 *
 * This file defines the interface contract that every room-storage adapter must
 * satisfy.  In JavaScript we express interfaces through JSDoc; infrastructure
 * adapters (e.g. InMemoryRoomRepository) must implement every method listed.
 *
 * @interface
 *
 * createRoom(socketId: string, playerName: string, minPlayers: number, maxPlayers: number)
 *   → { room: Room, playerId: string }
 *
 * joinRoom(socketId: string, playerName: string, roomId: string)
 *   → { room: Room, playerId: string, reconnected: boolean }
 *   | { error: string }
 *
 * getRoom(roomId: string)
 *   → Room | null
 *
 * getPlayerInfo(socketId: string)
 *   → { roomId: string, playerId: string, playerName: string } | null
 *
 * removePlayer(socketId: string)
 *   → { roomId: string, playerId: string, removed: boolean, room: Room } | null
 *
 * reassignHost(roomId: string)
 *   → void
 *
 * listPublicRooms()
 *   → { roomId, gameId, playerCount, maxPlayers, hostName }[]
 *
 * ── Room shape ──────────────────────────────────────────────────────────────
 * {
 *   roomId:       string,
 *   gameId:       string,
 *   hostPlayerId: string,
 *   status:       'lobby' | 'playing' | 'finished',
 *   players:      { playerId, playerName, socketId, connected }[],
 *   minPlayers:   number,
 *   maxPlayers:   number,
 *   gameState:    Object | null
 * }
 */

// No runtime code — interface documentation only.
