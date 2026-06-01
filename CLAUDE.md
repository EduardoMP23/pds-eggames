# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start server on :3000
npm run dev      # Start with --watch (auto-restart on file changes)
```

No test or lint commands are configured. There are no test files in this project.

## Architecture

This is a real-time multiplayer board game platform (EgGames) built with Node.js + Express + Socket.io. It follows **Hexagonal Architecture** (ports & adapters):

```
Domain → Application → Infrastructure (adapters)
```

**Domain** (`src/domain/`): Pure game logic with no I/O.
- `hive/HiveGame.js`, `hive/HiveBoard.js`, `hive/HiveMoves.js` — Hive board game (hex grid)
- `coup/CoupGame.js` — Coup card game
- `ito/ItoGame.js` — Ito number-guessing game
- Each game module exports: `initState()`, `applyAction(state, action, playerId)`, `getPublicState(state, playerId)`

**Application** (`src/application/`): Use-cases and orchestration.
- `RoomService.js` — Room lifecycle (create, join, remove, list)
- `GameService.js` — In-game actions, state broadcasts, reconnection
- `ports/` — Interface contracts (`RoomRepositoryPort`, `EventBusPort`)

**Infrastructure** (`src/infrastructure/`):
- `persistence/SQLiteRoomRepository.js` — In-memory Map (fast reads) + SQLite backup (5s flush). Rooms in `lobby`/`playing` status are restored on restart with all players marked disconnected.
- `events/SocketIOEventBus.js` — Socket.io event broadcaster (output adapter)
- `web/SocketHandler.js` — Socket.io event router (input adapter)
- `web/HttpRoutes.js` — REST endpoints (`/api/rooms`, `/api/room/:id`)

**Composition root**: `server.js` wires everything together.

## Frontend

Vanilla HTML/CSS/JS in `public/`. React 18 is loaded from CDN (unpkg) with Babel for JSX — no build step.

- `public/index.html` — Lobby/game select screen
- `public/game.html` — Game board UI (cache-busted via `?v=` query param in CI)
- `public/js/socket-client.js` — Socket.io singleton
- `public/js/games/{hive,coup,ito}.js` — Per-game rendering and UI interaction

## Socket Event Protocol

**Client → Server**: `room:create`, `room:join`, `lobby:ready`, `lobby:start`, `game:action`, `chat:message`

**Server → Client**: `room:created`, `room:joined`, `game:start`, `game:state-update`, `game:action-error`, `game:animate`, `game:events`, `game:over`, `game:reset`, `game:back-to-lobby`

Game state is **personalized per player** — each `game:state-update` is sent individually with that player's private info (e.g. their hand in Coup).

## Key Implementation Details

**Hex grid (Hive)**: Uses cubic coordinates `(q, r, s)` where `q + r + s = 0`. Slide gate rule and BFS connectivity checks enforce Hive rules. Queen surrounded = lose.

**Reconnection**: Players keep their `playerId` across page reloads. On reconnect the server re-sends `game:start` + current state. Disconnected players get 5s grace in lobby; rooms with no connected players are deleted after 30s.

**SQLite persistence**: Data stored in `./data/rooms.db` (or `DB_PATH` env var). The `data/` directory is gitignored.

## Deployment

Production runs on a Hostinger VPS with Nginx as reverse proxy and PM2 for process management. CI/CD via GitHub Actions (push to `main` → SSH deploy → `npm ci --omit=dev` → PM2 restart).
