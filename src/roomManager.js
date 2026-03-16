const { v4: uuidv4 } = require('uuid');

const rooms = new Map();
const players = new Map();

function createRoom(socketId, playerName, gameId, minPlayers, maxPlayers) {
  const roomId = uuidv4().slice(0, 8);
  const playerId = uuidv4().slice(0, 8);

  const room = {
    roomId,
    gameId,
    hostPlayerId: playerId,
    status: 'lobby',
    players: [{ playerId, playerName, socketId, connected: true }],
    minPlayers,
    maxPlayers,
    gameState: null
  };

  rooms.set(roomId, room);
  players.set(socketId, { roomId, playerId, playerName });

  return { room, playerId };
}

function joinRoom(socketId, playerName, roomId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };

  // Allow reconnect check before blocking
  const existingPlayer = room.players.find(p => p.playerName === playerName && !p.connected);
  if (!existingPlayer) {
    if (room.status === 'playing') return { error: 'Game already in progress' };
    if (room.players.filter(p => p.connected).length >= room.maxPlayers) return { error: 'Room is full' };
  }

  // Cancel pending cleanup timer when someone joins
  if (room._cleanupTimer) {
    clearTimeout(room._cleanupTimer);
    room._cleanupTimer = null;
  }

  // Reconnect existing disconnected player with same name
  if (existingPlayer) {
    existingPlayer.socketId = socketId;
    existingPlayer.connected = true;
    players.set(socketId, { roomId, playerId: existingPlayer.playerId, playerName });
    return { room, playerId: existingPlayer.playerId, reconnected: true };
  }

  const playerId = uuidv4().slice(0, 8);
  room.players.push({ playerId, playerName, socketId, connected: true });
  players.set(socketId, { roomId, playerId, playerName });

  return { room, playerId };
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getPlayerInfo(socketId) {
  return players.get(socketId);
}

function removePlayer(socketId) {
  const playerInfo = players.get(socketId);
  if (!playerInfo) return null;

  const { roomId, playerId } = playerInfo;
  const room = rooms.get(roomId);
  if (!room) return null;

  const player = room.players.find(p => p.playerId === playerId);
  if (player) player.connected = false;

  players.delete(socketId);

  // Clean up room after grace period if all still disconnected
  const connectedCount = room.players.filter(p => p.connected).length;
  if (connectedCount === 0 && room.status !== 'playing') {
    // 30s grace period to allow page navigation reconnections
    room._cleanupTimer = setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && r.players.filter(p => p.connected).length === 0 && r.status !== 'playing') {
        rooms.delete(roomId);
      }
    }, 30000);
  }

  return { roomId, playerId, removed: false, room };
}

function reassignHost(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const connected = room.players.find(p => p.connected);
  if (connected) room.hostPlayerId = connected.playerId;
}

function listPublicRooms() {
  const result = [];
  for (const room of rooms.values()) {
    if (room.status === 'lobby') {
      result.push({
        roomId: room.roomId,
        gameId: room.gameId,
        playerCount: room.players.filter(p => p.connected).length,
        maxPlayers: room.maxPlayers,
        hostName: room.players.find(p => p.playerId === room.hostPlayerId)?.playerName
      });
    }
  }
  return result;
}

module.exports = { createRoom, joinRoom, getRoom, getPlayerInfo, removePlayer, reassignHost, listPublicRooms };
