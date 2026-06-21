# Fireside Tavern · Current Stable Summary

## Project Root

- `/Users/ruiliu/Documents/炉石传说游戏自制`

## Public Repository

- [https://github.com/connect36/clawteam-lan-hearthstone](https://github.com/connect36/clawteam-lan-hearthstone)

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

## Current Play Layout

The main page is now tuned more aggressively for direct play instead of side documentation.

Desktop layout priorities:

- hero panels, battlefield, hand, and action buttons are kept in a tighter vertical stack
- `LAN address`, `combat log`, and `tips` sit below the playfield instead of taking board width in a right sidebar
- battlefield lanes are compressed to favor a single visible row of minions
- hand cards and board cards are tightened to reduce post-play scrolling

Mobile layout priorities:

- hand and board still allow horizontal overflow where needed
- controls remain usable on narrow touch screens

## How To Run

```bash
cd "/Users/ruiliu/Documents/炉石传说游戏自制"
npm install
npm start
```

Default behavior:

- `npm start` serves the project on `3301`

Custom port example:

```bash
PORT=3400 npm start
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

- [public/game-data.js](./public/game-data.js)

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

- [public/keywords.js](./public/keywords.js)

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
- attack targets and spell targets stay visually distinct
- hero and minion attack targets now use the same highlight language

## Opening and Draw Rules

At match start:

- a near-fullscreen first/second-player announcement is shown
- first player starts with `3` cards and draws `1` at the start of their first turn, reaching `4`
- second player starts with `4` cards and draws `1` at the start of their first turn, reaching `5`
- every later turn starts with `1` draw
- played cards leave the hand and unplayed cards remain for later turns

## Card Editor Capabilities

Editor files:

- [public/editor.html](./public/editor.html)
- [public/editor.js](./public/editor.js)
- [public/editor.css](./public/editor.css)
- [public/card-overrides.js](./public/card-overrides.js)

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

- [public/app.js](./public/app.js)
  Main client logic for solo, test mode, PvP UI, rendering, and interactions.

- [public/network.js](./public/network.js)
  WebSocket client wrapper, stable browser identity, and PvP message flow.

- [server/game-engine.mjs](./server/game-engine.mjs)
  Server-authoritative PvP rules and resolution.

- [server/protocol.mjs](./server/protocol.mjs)
  Message protocol and per-player filtered state output.

- [server/rooms.mjs](./server/rooms.mjs)
  Room lifecycle, room/player mapping, and reconnect cleanup.

- [server.mjs](./server.mjs)
  HTTP server, static routing, WebSocket integration, and API endpoints.

## Recent Stability Notes

- the default server port has been restored to `3301`
- `http://127.0.0.1:3301/` and `http://127.0.0.1:3301/agents` are both part of the normal local workflow
- desktop combat layout was recently compacted specifically to reduce scrolling between hand play and target selection

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

1. Start with [README.md](./README.md)
2. Then read this file for the stable current state
3. Then read [AI_DEV_GUIDE.md](./AI_DEV_GUIDE.md) before modifying code
4. Use [AI_PROCESS.md](./AI_PROCESS.md) when historical debugging context matters
