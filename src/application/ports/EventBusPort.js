'use strict';

/**
 * EventBusPort — output port for broadcasting real-time events to clients.
 *
 * Infrastructure adapters (e.g. SocketIOEventBus) must implement every method.
 *
 * @interface
 *
 * toRoom(roomId: string, event: string, data: any)
 *   → void
 *   Emit an event to every socket currently in the room.
 *
 * toSocket(socketId: string, event: string, data: any)
 *   → void
 *   Emit an event to one specific socket.
 *
 * broadcastGameState(room: Room, getStateFn: (playerId: string) => any)
 *   → void
 *   Deliver a personalised game-state update to each connected player in the room.
 */

// No runtime code — interface documentation only.
