# Fireside Tavern · Current Stable Summary

## Project Root

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## What This Project Is

This is a browser-based Hearthstone-style mini game that currently includes:

- a one-stage solo boss fight
- a solo local test mode
- LAN PvP multiplayer
- a built-in card editor
- a separate `/agents` collaboration log page

Main goals:

- playable on desktop and mobile
- reachable by devices on the same LAN
- no frontend framework dependency

## How To Run

```bash
cd "/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone"
npm install
npm start
```

Custom port example:

```bash
PORT=3301 npm start
```

The server listens on:

- `0.0.0.0`

## Main Routes

- `/`
  Main game page
- `/editor`
  Card editor
- `/agents`
  Manager / agents log page
- `/api/meta`
  LAN address metadata
- `/api/healthz`
  Health check

## Supported Game Modes

### 1. Solo Boss Fight

Characteristics:

- single-player
- one boss pressure encounter
- supports minions, spells, armor, healing, draw, summon, buffs, and normal turn flow

### 2. Local Test Mode

Purpose:

- quick one-player mechanics testing without a second device

Current rules:

- opponent name is `Test Sparring Partner`
- the opponent gains `5` armor every enemy turn
- the opponent summons one `2/2` minion every enemy turn

### 3. LAN PvP

Characteristics:

- room creation / join flow
- ready-up before match start
- local network multiplayer on desktop and mobile
- supports targeting, card play, combat, end turn, and win/loss handling

## Current Card Model

Base card data lives in:

- [public/game-data.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/game-data.js:1)

The main card shape centers around:

```js
{
  id,
  name,
  cost,
  type,
  text,
  attack,
  health,
  keywords,
  effects
}
```

## Supported Effect Types

- `damage`
- `heal`
- `armor`
- `draw`
- `summon`
- `buff`
- `conditional`

## Supported Keywords

The shared keyword module lives in:

- [public/keywords.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/keywords.js:1)

Currently supported:

- `Taunt`
  Attackers must attack a taunt minion first if one exists.
- `Poisonous`
  If damage lands on a minion, that minion dies.
- `Divine Shield`
  Negates the first incoming damage instance.
- `Lifesteal`
  Heals the controlling hero for damage dealt.
- `Windfury`
  Allows two attacks per turn.
- `Reborn`
  Revives once at `1` health while preserving the minion’s other keyword effects and original attack.

Display order is standardized so `Reborn` appears last.

## Current Targeting Rules

The targeting system is now aligned across the editor, solo runtime, and PvP server.

Rules include:

- `player choice`
  Can select any hero or any minion, friendly or enemy.
- `enemy hero / enemy minion / friendly hero / friendly minion`
  Restrict valid clickable targets by category.
- `same target`
  Follow-up conditional effects reuse the target chosen for the primary effect.
- all valid targets are highlighted in the UI

## Opening and Draw Rules

At match start:

- a near-fullscreen first/second-player announcement is shown
- first player starts with `3` cards and draws `1` at the start of their first turn, reaching `4`
- second player starts with `4` cards and draws `1` at the start of their first turn, reaching `5`
- every later turn starts with `1` draw
- played cards leave the hand and unplayed cards remain for later turns

## Card Editor Capabilities

Editor files:

- [public/editor.html](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.html:1)
- [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)
- [public/editor.css](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.css:1)
- [public/card-overrides.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/card-overrides.js:1)

The editor can currently change:

- card name
- mana cost
- card type
- enable / disable
- starting deck count
- minion attack / health
- minion keywords
- spell damage amount
- spell target
- heal / armor / draw values
- summon count / name / attack / health / keywords
- conditional trigger
- conditional reward type
- conditional target
- conditional reward value
- advanced `JSON` effects

Current editor behavior:

- `editorModel` is the structured source of truth
- card text can be generated from structured fields
- overrides are stored in browser local storage
- template cards can be created from the editor

## Save and Resume

### Solo Modes

- `Boss Fight` and `Local Test Mode` save state to browser local storage
- refreshing or reopening the browser attempts to restore the previous solo board state

### PvP

- the browser keeps a stable local identity
- refreshing or reopening on the same device attempts to rejoin the room or active match
- the server keeps a reconnect grace window of about `5 minutes`

### URL Conventions

To make restore behavior more stable, the app uses mode-specific query parameters:

- `/?mode=solo&scenario=boss`
- `/?mode=solo&scenario=test`
- `/?mode=pvp&room=ABCD`

## Main Runtime Files

- [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)
  Main client logic for solo, test mode, PvP UI, rendering, and interactions.

- [public/network.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/network.js:1)
  WebSocket client wrapper, stable browser identity, and PvP message flow.

- [server/game-engine.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/game-engine.mjs:1)
  Server-authoritative PvP rules and resolution.

- [server/protocol.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/protocol.mjs:1)
  Message protocol and per-player filtered state output.

- [server/rooms.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/rooms.mjs:1)
  Room lifecycle, room/player mapping, and reconnect cleanup.

- [server.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server.mjs:1)
  HTTP server, static routing, WebSocket integration, and API endpoints.

## Known Limits

- The editor handles structured effects well, but deeply nested custom effect trees are still better expressed through extra `JSON`.
- PvP resume depends on:
  - the same device
  - the same browser-local identity
  - the server still running
- There is no spectator system yet.
- There is no chat system yet.
- Full multi-device browser automation coverage is still incomplete; validation currently relies on targeted assertions and manual multiplayer checks.

## Suggested Reading Order

1. Start with [README.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/README.md:1)
2. Then read this file for the stable current state
3. Then read [AI_DEV_GUIDE.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_DEV_GUIDE.md:1) before modifying code
4. Use [AI_PROCESS.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_PROCESS.md:1) when historical debugging context matters
