# Fireside Tavern · Development and Maintenance Guide

## Project Root

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## Tech Stack

- Backend: native Node.js HTTP + `ws`
- Frontend: plain HTML / CSS / JavaScript ES Modules
- Data: base card data + browser-local overrides + server-side PvP runtime state

## Start the Project

```bash
cd "/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone"
npm install
npm start
```

Common test port:

```bash
PORT=3301 npm start
```

## Routes and Pages

- `/`
  Main game page with Boss mode, Local Test Mode, and LAN PvP
- `/editor`
  Card editor
- `/agents`
  Work log and collaboration page
- `/api/meta`
  Returns LAN address metadata
- `/api/healthz`
  Returns service health information

## Directory Layout

```text
clawteam-lan-hearthstone/
├── server.mjs
├── server/
│   ├── game-engine.mjs
│   ├── protocol.mjs
│   └── rooms.mjs
├── public/
│   ├── app.js
│   ├── network.js
│   ├── game-data.js
│   ├── keywords.js
│   ├── card-overrides.js
│   ├── editor.html
│   ├── editor.js
│   ├── editor.css
│   ├── index.html
│   ├── styles.css
│   ├── agents.html
│   ├── agents-app.js
│   ├── agents.css
│   ├── agent-worklog.js
│   └── animations.js
├── README.md
├── AI_HANDOFF.md
├── AI_PROCESS.md
├── AI_CONCLUSION.md
├── GITHUB_PUBLISH.md
└── package.json
```

## Core Module Responsibilities

### [public/game-data.js](./public/game-data.js)

Responsible for:

- default card data
- default deck composition
- base solo scenario configuration

Good place to change:

- default cards
- default deck counts
- base boss encounter setup

### [public/card-overrides.js](./public/card-overrides.js)

Responsible for:

- browser-local override storage
- editor persistence
- overlaying custom cards on top of default data

### [public/editor.js](./public/editor.js)

Responsible for:

- structured editor form state
- `editorModel`
- auto text generation
- loading and saving override data

Key rule:

- structured fields are the first source of truth
- card text should be generated from structure, not used to drive structure backwards

### [public/keywords.js](./public/keywords.js)

Responsible for:

- keyword definitions
- keyword ordering
- minion runtime keyword helpers

If a new keyword is needed, start here.

### [public/app.js](./public/app.js)

Responsible for:

- main page rendering
- solo gameplay
- local test mode
- PvP client interactions
- target highlighting
- local save / restore logic

This is currently the highest-churn file in the project.

### [public/network.js](./public/network.js)

Responsible for:

- WebSocket connection handling
- stable browser `clientId`
- PvP message dispatch
- reconnect identity preservation

### [server/game-engine.mjs](./server/game-engine.mjs)

Responsible for:

- server-authoritative PvP resolution
- play card / attack / end turn
- spell target validation
- keyword effects
- death / reborn / Divine Shield combat logic

If a rule must truly count in multiplayer, it ultimately needs to be correct here.

### [server/protocol.mjs](./server/protocol.mjs)

Responsible for:

- room and game message structures
- per-player filtered state
- preventing hidden hand/deck information from leaking to the opponent

### [server/rooms.mjs](./server/rooms.mjs)

Responsible for:

- room creation / join / leave / dissolve
- room and player mapping
- reconnect cleanup and grace-window handling

### [server.mjs](./server.mjs)

Responsible for:

- HTTP entrypoint
- static routing
- `/editor`, `/agents`, and API routing
- WebSocket entry and message routing

## Adding New Features

### Add a New Card

Preferred path:

1. add the default card in [public/game-data.js](./public/game-data.js)
2. if the change should stay local instead of modifying defaults, use `/editor`

### Add a New Effect Type

At minimum, check these three layers:

1. does the editor need a structured field for it?
2. does solo runtime support it?
3. does the PvP server support it?

This usually touches:

- [public/editor.js](./public/editor.js)
- [public/app.js](./public/app.js)
- [server/game-engine.mjs](./server/game-engine.mjs)

### Add a New Keyword

Recommended order:

1. define it in [public/keywords.js](./public/keywords.js)
2. wire it into solo runtime
3. wire it into the PvP server
4. add editor UI support

### Change the Targeting System

Targeting is the easiest area to desynchronize between editor and runtime.

Always review all of:

- [public/editor.js](./public/editor.js)
- [public/app.js](./public/app.js)
- [server/game-engine.mjs](./server/game-engine.mjs)

Pay extra attention to:

- `player choice`
- `same target`
- friendly / enemy / hero / minion distinctions
- keeping client highlighting aligned with server legality checks

## Save and Resume Notes

### Solo Modes

Solo `Boss` and `Local Test Mode` save board state in browser local storage.

If you change this area, verify:

- `localStorage` key design
- URL parameter sync
- whether restart / replay clears the correct state

### PvP

PvP resume depends on:

- `clientId`
- room id
- the server-side reconnect window

If you change any of this, re-test:

- refresh while waiting in a room
- refresh during an active match
- host exit
- guest exit
- room dissolution

## UI Editing Notes

### Main Page

For main page UI changes, check all three:

- [public/index.html](./public/index.html)
- [public/styles.css](./public/styles.css)
- [public/app.js](./public/app.js)

### Editor Page

For editor changes, check all three:

- [public/editor.html](./public/editor.html)
- [public/editor.css](./public/editor.css)
- [public/editor.js](./public/editor.js)

### `/agents` Page

For log-page display changes, check:

- [public/agents.html](./public/agents.html)
- [public/agents.css](./public/agents.css)
- [public/agents-app.js](./public/agents-app.js)
- [public/agent-worklog.js](./public/agent-worklog.js)

## Recommended Regression Checklist

After changing code, at least re-check:

- Boss mode starts correctly
- Local Test Mode starts correctly
- room creation and room join work
- both players can enter the match after readying up
- spell target highlighting is correct
- `player choice` can select any legal target
- `same target` follows the primary target
- `Divine Shield / Poisonous / Lifesteal / Windfury / Reborn / Taunt` all work
- solo refresh restores progress
- PvP refresh restores the room or active match
- narrow mobile layouts do not visibly break

## Useful Commands

### Syntax Checks

```bash
node --check public/app.js
node --check public/editor.js
node --check public/network.js
node --check public/keywords.js
node --check server/game-engine.mjs
node --check server/protocol.mjs
node --check server/rooms.mjs
node --check server.mjs
```

### Start the Server

```bash
PORT=3301 npm start
```

### Basic Health Checks

```bash
curl -I http://127.0.0.1:3301/
curl http://127.0.0.1:3301/api/healthz
```

## Documentation Maintenance Rule

When features change, update these together when appropriate:

- [README.md](./README.md)
  Human-facing overview
- [AI_CONCLUSION.md](./AI_CONCLUSION.md)
  Stable current state
- [AI_PROCESS.md](./AI_PROCESS.md)
  Process and debugging history
- [GITHUB_PUBLISH.md](./GITHUB_PUBLISH.md)
  Publication status and GitHub notes
