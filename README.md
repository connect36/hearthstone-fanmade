# Fireside Tavern · LAN Hearthstone-Style Card Game

A browser-based Hearthstone-inspired mini game with:

- a one-stage solo boss fight
- a solo local test mode
- LAN PvP multiplayer
- a built-in card editor
- a separate `/agents` collaboration log page

Project root:

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

GitHub repository:

- [https://github.com/connect36/clawteam-lan-hearthstone](https://github.com/connect36/clawteam-lan-hearthstone)

## Current Features

### Game Modes

- `Solo Boss Fight`
  A single-stage pressure fight against a predefined boss.

- `Local Test Mode`
  A one-player sandbox for testing turns, targeting, combat, and card effects.
  The opponent does the following on each enemy turn:
  - gains `5` armor
  - summons one `2/2` minion

- `LAN PvP`
  Computers and phones on the same local network can join the same match.

### Card Effects and Mechanics

Currently supported effect families:

- `damage`
- `heal`
- `armor`
- `draw`
- `summon`
- `buff`
- `conditional`

Currently supported keywords:

- `Taunt`
- `Poisonous`
- `Reborn`
- `Divine Shield`
- `Lifesteal`
- `Windfury`

Rule details:

- `Taunt` forces attackers to target a taunt minion first.
- `Reborn` revives a minion at `1` health while preserving its other keyword effects and original attack. `Reborn` itself only triggers once.
- `Player choice` damage and healing effects can target any hero or any minion, including friendly targets.

### Card Editor

The editor can currently modify:

- card name
- mana cost
- card type
- enable / disable
- starting deck count
- minion attack / health
- minion keywords
- spell damage amount / spell target
- heal / armor / draw values
- summon count / name / attack / health / keywords
- conditional trigger and conditional reward
- advanced `JSON` effects

### Save and Resume

- `Solo Boss Fight` and `Local Test Mode`
  The current board state is stored in browser `localStorage`.
  Refreshing the page or reopening the browser will attempt to restore progress.

- `LAN PvP`
  The browser keeps a stable local identity.
  Refreshing or reopening on the same device attempts to rejoin the room or active match.
  The server currently keeps a reconnect window of about `5 minutes`.

## Run

```bash
cd "/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone"
npm install
npm start
```

Default port:

- `3000`

Custom port example:

```bash
PORT=3301 npm start
```

The server listens on `0.0.0.0`, so devices on the same LAN can connect directly.

## Main Routes

- `/`
  Main game page
- `/editor`
  Card editor
- `/agents`
  Manager / agents work log page
- `/api/meta`
  LAN address metadata
- `/api/healthz`
  Health check

Useful examples:

- [http://127.0.0.1:3301/](http://127.0.0.1:3301/)
- [http://127.0.0.1:3301/editor](http://127.0.0.1:3301/editor)
- [http://127.0.0.1:3301/agents](http://127.0.0.1:3301/agents)

## URL Conventions

To make resume behavior more stable, the app uses different URL query modes:

- `/?mode=solo&scenario=boss`
- `/?mode=solo&scenario=test`
- `/?mode=pvp&room=ABCD`

## Project Structure

```text
clawteam-lan-hearthstone/
├── server.mjs
├── server/
│   ├── game-engine.mjs
│   ├── protocol.mjs
│   └── rooms.mjs
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── network.js
│   ├── game-data.js
│   ├── keywords.js
│   ├── card-overrides.js
│   ├── animations.js
│   ├── editor.html
│   ├── editor.css
│   ├── editor.js
│   ├── agents.html
│   ├── agents.css
│   ├── agents-app.js
│   └── agent-worklog.js
├── README.md
├── AI_HANDOFF.md
├── AI_PROCESS.md
├── AI_CONCLUSION.md
├── AI_DEV_GUIDE.md
├── GITHUB_PUBLISH.md
├── package.json
└── package-lock.json
```

## Core Files

- [server.mjs](./server.mjs)
  HTTP server, static routing, WebSocket entrypoints, room events, and reconnect handling.

- [server/game-engine.mjs](./server/game-engine.mjs)
  Server-authoritative PvP combat logic.

- [server/protocol.mjs](./server/protocol.mjs)
  Room messages and per-player filtered game state.

- [public/app.js](./public/app.js)
  Solo mode, test mode, PvP rendering, interactions, and restore logic.

- [public/network.js](./public/network.js)
  WebSocket client wrapper with stable browser identity.

- [public/keywords.js](./public/keywords.js)
  Shared keyword definitions, ordering, and minion runtime helpers.

- [public/editor.js](./public/editor.js)
  Card editor logic. `editorModel` is the structured source of truth.

## Suggested Validation

For a quick sanity pass:

1. Open `Local Test Mode`
2. Play a spell and confirm target highlighting / target selection works
3. Play a keyword minion and verify combat, shield, reborn, and attack behavior
4. Refresh the page and confirm solo progress is restored
5. Start a LAN room, refresh one client, and confirm the room or match resumes

## Known Limits

- The editor is strong for structured effects, but deeply nested custom effect trees are still better expressed in extra `JSON`.
- PvP resume depends on:
  - the same device
  - the same browser-local identity
  - the server still running
- There is no spectator system yet.
- There is no chat system yet.

## AI Documentation

- [AI_HANDOFF.md](./AI_HANDOFF.md)
  AI handoff index
- [AI_CONCLUSION.md](./AI_CONCLUSION.md)
  Current stable project state
- [AI_PROCESS.md](./AI_PROCESS.md)
  Process log and debugging history
- [AI_DEV_GUIDE.md](./AI_DEV_GUIDE.md)
  Maintenance guide for the next developer or AI
- [GITHUB_PUBLISH.md](./GITHUB_PUBLISH.md)
  GitHub publication notes
