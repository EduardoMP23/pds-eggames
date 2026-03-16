const roomManager = require('./roomManager');
const gameRegistry = require('./gameRegistry');

module.exports = function (io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // ---- ROOM MANAGEMENT ----

    socket.on('room:create', ({ gameId, playerName }) => {
      const game = gameRegistry.getGame(gameId);
      if (!game) return socket.emit('room:join-error', { message: 'Unknown game' });

      const { room, playerId } = roomManager.createRoom(
        socket.id, playerName, gameId, game.minPlayers, game.maxPlayers
      );

      socket.join(room.roomId);
      socket.emit('room:created', {
        roomId: room.roomId,
        playerId,
        playerName,
        gameId,
        players: room.players.map(p => ({ playerId: p.playerId, playerName: p.playerName, connected: p.connected })),
        isHost: true,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers
      });
    });

    socket.on('room:join', ({ roomId, playerName }) => {
      const result = roomManager.joinRoom(socket.id, playerName, roomId);
      if (result.error) return socket.emit('room:join-error', { message: result.error });

      const { room, playerId, reconnected } = result;
      socket.join(roomId);

      const playerList = room.players.map(p => ({ playerId: p.playerId, playerName: p.playerName, connected: p.connected }));

      socket.emit('room:joined', {
        roomId,
        playerId,
        playerName,
        gameId: room.gameId,
        players: playerList,
        isHost: room.hostPlayerId === playerId,
        status: room.status,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers
      });

      if (room.status === 'playing') {
        const game = gameRegistry.getGame(room.gameId);
        if (game && room.gameState) {
          socket.emit('game:start', { gameId: room.gameId, roomId });
          socket.emit('game:state-update', game.getPublicState(room.gameState, playerId));
        }
      }

      socket.to(roomId).emit('lobby:player-joined', { playerId, playerName, players: playerList });
    });

    socket.on('lobby:start', ({ roomId }) => {
      const playerInfo = roomManager.getPlayerInfo(socket.id);
      if (!playerInfo) return;

      const room = roomManager.getRoom(roomId);
      if (!room) return socket.emit('room:join-error', { message: 'Room not found' });
      if (room.hostPlayerId !== playerInfo.playerId) return socket.emit('room:join-error', { message: 'Only host can start' });

      const connectedPlayers = room.players.filter(p => p.connected);
      if (connectedPlayers.length < room.minPlayers) {
        return socket.emit('room:join-error', { message: `Need at least ${room.minPlayers} players` });
      }

      const game = gameRegistry.getGame(room.gameId);
      room.gameState = game.initState(connectedPlayers.map(p => ({ playerId: p.playerId, playerName: p.playerName })));
      room.status = 'playing';

      io.to(roomId).emit('game:start', { gameId: room.gameId, roomId });

      // Send individual state updates
      connectedPlayers.forEach(p => {
        const playerSocket = io.sockets.sockets.get(p.socketId);
        if (playerSocket) {
          playerSocket.emit('game:state-update', game.getPublicState(room.gameState, p.playerId));
        }
      });
    });

    socket.on('game:action', ({ roomId, action }) => {
      const playerInfo = roomManager.getPlayerInfo(socket.id);
      if (!playerInfo) return;

      const room = roomManager.getRoom(roomId);
      if (!room || room.status !== 'playing') return;

      const game = gameRegistry.getGame(room.gameId);
      const result = game.applyAction(room.gameState, action, playerInfo.playerId);

      if (result.error) {
        return socket.emit('game:action-error', { message: result.error });
      }

      if (result.events && result.events.length > 0) {
        io.to(roomId).emit('game:events', { events: result.events });
      }

      if (result.gameOver) {
        room.status = 'finished';
        io.to(roomId).emit('game:over', { winner: result.winner, winnerName: result.winnerName, reason: result.reason });
      }

      // Send individual state updates
      room.players.filter(p => p.connected).forEach(p => {
        const playerSocket = io.sockets.sockets.get(p.socketId);
        if (playerSocket) {
          playerSocket.emit('game:state-update', game.getPublicState(room.gameState, p.playerId));
        }
      });

      // Handle nope timer for Exploding Kittens
      if (result.nopeTimer) {
        clearTimeout(room._nopeTimer);
        room._nopeTimer = setTimeout(() => {
          const r = roomManager.getRoom(roomId);
          if (!r || !r.gameState) return;
          const g = gameRegistry.getGame(r.gameId);
          const timerResult = g.resolveNopeTimer(r.gameState);
          if (timerResult) {
            if (timerResult.events) io.to(roomId).emit('game:events', { events: timerResult.events });
            if (timerResult.gameOver) {
              r.status = 'finished';
              io.to(roomId).emit('game:over', { winner: timerResult.winner, winnerName: timerResult.winnerName });
            }
            r.players.filter(p => p.connected).forEach(p => {
              const ps = io.sockets.sockets.get(p.socketId);
              if (ps) ps.emit('game:state-update', g.getPublicState(r.gameState, p.playerId));
            });
          }
        }, 5000);
      }
    });

    socket.on('chat:message', ({ roomId, text }) => {
      const playerInfo = roomManager.getPlayerInfo(socket.id);
      if (!playerInfo) return;
      io.to(roomId).emit('chat:message', {
        playerName: playerInfo.playerName,
        text: text.slice(0, 200),
        timestamp: Date.now()
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const result = roomManager.removePlayer(socket.id);
      if (!result) return;

      const { roomId, playerId, removed, room } = result;
      if (removed) return;

      if (room) {
        roomManager.reassignHost(roomId);
        const updatedRoom = roomManager.getRoom(roomId);
        if (updatedRoom) {
          io.to(roomId).emit('lobby:player-left', {
            playerId,
            players: updatedRoom.players.map(p => ({ playerId: p.playerId, playerName: p.playerName, connected: p.connected })),
            newHostId: updatedRoom.hostPlayerId
          });
        }
      }
    });
  });
};
