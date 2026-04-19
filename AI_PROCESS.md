# Fireside Tavern · Development Process Log

## Project Root

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## Document Scope

This file only records:

- what changed
- why it changed
- which bugs were fixed
- what was validated

For the current stable state, see:

- [AI_CONCLUSION.md](./AI_CONCLUSION.md)

For GitHub publication status, see:

- [GITHUB_PUBLISH.md](./GITHUB_PUBLISH.md)

## Main Development Stages

### 1. Base Game and LAN Access

The project started as a browser-based Hearthstone-style mini game with three core goals:

- desktop and mobile support
- LAN accessibility
- no frontend framework dependency

This stage established:

- the Node static server
- page routing
- `0.0.0.0` listening
- `/api/meta` for LAN address output
- `/api/healthz` for service checks

### 2. Splitting the Main Page and `/agents`

Agent information originally lived on the main game page, then moved to a dedicated `/agents` page.

Reasons:

- the main page should stay focused on gameplay
- manager / agent logs quickly became too large for a sidebar
- raw logs and detailed timelines needed more space

The `/agents` page later expanded to include:

- manager / agents current state
- interaction timeline
- detailed task records
- raw-log sections

### 3. Card Editor Iteration

The editor began as a simple stats/effects editor and gradually evolved into a structured editor.

Problems discovered in this phase:

- structured fields and displayed text drifted apart
- saving could overwrite recently edited mechanism fields
- some targeting logic was only editable through raw JSON
- custom cards did not always flow back into runtime correctly

Fix direction:

- `editorModel` became the structured source of truth
- automatic text generation was tied to structured fields
- save flows were adjusted to avoid destructive re-renders
- common effect and conditional settings were surfaced as explicit fields

### 4. Unified Targeting Across Editor, Solo Runtime, and PvP

A major later pass focused on “the editor says one thing, but runtime resolves another.”

Typical issues found:

- PvP target validation did not match editor targeting capabilities
- `player choice` spells could not actually target any legal unit
- `same target` follow-up effects did not track the first chosen target
- target highlighting was incomplete and confusing

The final unified rule set:

- `player choice` can select any hero or minion, friendly or enemy
- `same target` follows the primary chosen target
- all selectable targets are highlighted on the client
- the PvP server validates and resolves the same target rules

### 5. LAN PvP Infrastructure Fixes

Once multiplayer was added, a concentrated debugging pass fixed core PvP issues.

Confirmed problems included:

- risk of hidden-information leakage in synchronized state
- incorrect per-player room-state personalization
- unstable disconnect / leave / dissolve flows
- lobby recovery paths touching missing UI elements

Fix direction:

- filter room and game state per player
- repair lobby recovery UI paths
- establish stable `playerId / clientId` handling
- add a reconnect window for disconnected players

### 6. Opening Animation and Draw Rules

The opening flow and draw rules were later revised to match the requested simplified Hearthstone pattern.

Implemented behavior:

- a near-fullscreen first/second-player intro banner
- first player starts with 3 cards, then draws 1 at the start of their first turn
- second player starts with 4 cards, then draws 1 at the start of their first turn
- every later turn starts with 1 draw
- played cards leave the hand, unplayed cards stay

### 7. Keyword System

A shared keyword module was then added and connected to both solo and PvP.

Implemented keywords:

- `Taunt`
- `Poisonous`
- `Reborn`
- `Divine Shield`
- `Lifesteal`
- `Windfury`

Important implementation notes:

- keyword behavior moved into a shared module instead of duplicated logic
- minion runtime state started explicitly tracking shield, reborn availability, attacks used, and per-turn attack limits
- the editor and summon tokens also gained keyword support

### 8. Reborn Edge-Case Fix

After keywords were added, a critical rules bug appeared:

- a `Divine Shield + Reborn` minion lost Divine Shield after reborn

Final behavior after the fix:

- reborn preserves other keyword effects
- reborn preserves normal attack
- only health becomes `1`
- reborn itself is consumed once

### 9. Local Test Mode

To make solo verification easier, a `Local Test Mode` was added.

Rules for this mode:

- opponent name: `Test Sparring Partner`
- the opponent gains `5` armor each enemy turn
- the opponent summons one `2/2` minion each enemy turn

Why it was added:

- no second device is required
- no need to repeatedly run the full PvP room flow
- much faster for validating spell targeting, attack counts, keywords, and turn flow

### 10. Solo Save State and PvP Reconnect

Later, progress persistence was added because both solo and multiplayer lost all progress on refresh.

Final approach:

- solo `Boss` and `Local Test Mode` states are saved in browser storage
- the URL reflects mode state, for example `?mode=solo&scenario=test`
- PvP uses a stable browser-local identity
- the server keeps a short reconnect grace window
- reopening on the same device attempts to resume the room or match

### 11. Documentation Cleanup and GitHub Packaging

Before publication, the project received a dedicated documentation pass.

This pass included:

- rewriting [README.md](./README.md)
- keeping and updating `AI_PROCESS / AI_CONCLUSION / AI_DEV_GUIDE`
- adding [GITHUB_PUBLISH.md](./GITHUB_PUBLISH.md)
- adding [.gitignore](./.gitignore)
- initializing a standalone git repository inside the project folder to avoid depending on the outer mixed workspace

### 12. Public GitHub Publication

After the documentation pass, the project was published as a public English-language GitHub repository.

Publication target:

- [https://github.com/connect36/clawteam-lan-hearthstone](https://github.com/connect36/clawteam-lan-hearthstone)

Publication details:

- visibility: `public`
- documentation language: `English`
- local standalone git repository pushed to `main`

## Major Problems Fixed During Iteration

### Editor Issues

- text and structured fields falling out of sync
- `conditional reward value` being overwritten after save
- missing conditional target options
- some mechanics editable only through raw JSON

### Targeting Issues

- `Last Stand` and similar player-choice spells not targeting any legal unit
- `same target` follow-up effects not tracking the first target
- incomplete target highlighting

### PvP Issues

- synchronized state risking hidden-information leaks
- spell targets resolving differently in PvP
- room-state personalization errors
- disconnect / leave / resume instability

### Rules Issues

- `Divine Shield + Reborn` losing Divine Shield after reborn
- inconsistent keyword display order
- `Reborn` eventually being standardized to display last

## Validation Performed

### Syntax Checks

The following files were repeatedly checked with `node --check`:

- `public/app.js`
- `public/network.js`
- `public/editor.js`
- `public/keywords.js`
- `server/game-engine.mjs`
- `server/protocol.mjs`
- `server/rooms.mjs`
- `server.mjs`

### Rule Assertions

Targeted assertions were run for:

- `Taunt` target restriction
- `Divine Shield` absorbing the first damage instance
- `Poisonous` killing a damaged minion
- `Reborn` reviving at `1` health
- `Windfury` allowing two attacks per turn
- `Lifesteal` healing the attacking hero
- `player choice` target validation
- friendly / enemy / minion / hero target resolution
- `Divine Shield + Reborn + Windfury` preserving other keywords after reborn

### Resume Validation

Additional Node-level reconnect validation covered:

- disconnect and reconnect while waiting in a room
- disconnect and reconnect after a game has started
- restoring the original room or game state with the same `clientId`

### Local Service Checks

The following routes were repeatedly confirmed to respond correctly:

- `/`
- `/editor`
- `/agents`
- `/api/healthz`

Common test port:

- `3301`

## Ongoing Maintenance Rule

- new implementation history, debugging notes, and failed attempts go here
- the stable current state belongs in [AI_CONCLUSION.md](./AI_CONCLUSION.md)
- GitHub publication status belongs in [GITHUB_PUBLISH.md](./GITHUB_PUBLISH.md)
