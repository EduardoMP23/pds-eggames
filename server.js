'use strict';

/**
 * server.js — Composition Root
 *
 * Wires together all layers of the hexagonal architecture:
 *
 *   Domain       src/domain/hive/          pure game logic
 *   Application  src/application/          use-cases & port interfaces
 *   Infrastructure
 *     persistence  InMemoryRoomRepository  room storage (output adapter)
 *     events       SocketIOEventBus        real-time broadcast (output adapter)
 *     web          SocketHandler           socket events (input adapter)
 *                  HttpRoutes              REST API      (input adapter)
 */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

// ── Infrastructure ────────────────────────────────────────────────────────────
const SQLiteRoomRepository   = require('./src/infrastructure/persistence/SQLiteRoomRepository');
const SocketIOEventBus       = require('./src/infrastructure/events/SocketIOEventBus');
const HttpRoutes             = require('./src/infrastructure/web/HttpRoutes');
const SocketHandler          = require('./src/infrastructure/web/SocketHandler');

// ── Application ───────────────────────────────────────────────────────────────
const RoomService = require('./src/application/RoomService');
const GameService = require('./src/application/GameService');

// ── HTTP & Socket.io setup ────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors:          { origin: '*', methods: ['GET', 'POST'] },
  transports:    ['websocket', 'polling'],
  pingTimeout:   60_000,
  pingInterval:  25_000
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SPA routes
app.get('/lobby/:roomId', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'lobby.html')));
app.get('/game/:roomId',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/health',        (_req, res) => res.json({ status: 'ok' }));

// ── Composition root ──────────────────────────────────────────────────────────
const roomRepository = new SQLiteRoomRepository();
const eventBus       = new SocketIOEventBus(io);

const roomService = new RoomService(roomRepository);
const gameService = new GameService(roomRepository, eventBus);

const httpRoutes    = new HttpRoutes(roomService);
const socketHandler = new SocketHandler(io, roomService, gameService, eventBus);

app.use('/api', httpRoutes.router());
socketHandler.register();

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Hive server running on port ${PORT}`));
