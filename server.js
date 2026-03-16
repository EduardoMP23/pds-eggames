const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const roomManager = require('./src/roomManager');
const socketHandler = require('./src/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SPA routes
app.get('/lobby/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lobby.html'));
});
app.get('/game/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// API
app.get('/api/rooms', (req, res) => {
  const rooms = roomManager.listPublicRooms();
  res.json(rooms);
});
app.get('/api/room/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    roomId: room.roomId,
    gameId: room.gameId,
    status: room.status,
    players: room.players.map(p => ({ playerId: p.playerId, playerName: p.playerName, connected: p.connected })),
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers
  });
});

socketHandler(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
