# Project Index — `ProcSite/src`

A SvelteKit application that renders a procedural ASCII canvas background with an in-browser hacking minigame, dialogue-driven intro, and a Web Audio sound system.

---

## Directory Structure

```
src/
├── app.d.ts                  # SvelteKit global type declarations (no functions)
├── app.html                  # HTML shell template (no functions)
├── lib/
│   ├── assets/
│   │   └── favicon.svg       # Static asset (no functions)
│   ├── audio/
│   │   ├── beats.js          # Strudel-based beat engine
│   │   ├── context.js        # Shared AudioContext management
│   │   ├── index.js          # Audio barrel re-export
│   │   └── keys.js           # Keystroke / UI sound effects
│   │   └── prebake.js        # Strudel DSP function strings (no JS functions)
│   ├── game/
│   │   ├── commands.js       # Game command parser & state machine
│   │   ├── modifiers.js      # Word-based game modifier configs
│   │   ├── network.js        # Procedural network/graph generator
│   │   └── player.js         # Player, Trace, Rival, Overlord logic
│   ├── modes/
│   │   ├── fractal.js        # Julia-set render mode
│   │   ├── grid.js           # Noise-driven character grid mode
│   │   ├── index.js          # Mode registry & random picker
│   │   ├── multilayer.js     # Multi-frequency noise blend mode
│   │   ├── particles.js      # Noise-steered particle mode
│   │   └── terrain.js        # Block-character terrain mode
│   ├── characters.js         # Character set & per-cell shuffle logic
│   ├── constants.js          # Global constants & lookup tables (no functions)
│   ├── effects.js            # Cursor glow, ripple, clear-zone effects
│   ├── headers.js            # Floating scramble-decode header words
│   ├── index.js              # Lib barrel re-export (no functions)
│   ├── noise.js              # FastNoiseLite wrappers
│   ├── palette.js            # Color string generation & morphing
│   ├── randomize.js          # Top-level scene randomizer (state-object style)
│   ├── renderer.js           # Canvas grid measurement & sizing
│   ├── Intro.svelte          # Dialogue/intro overlay component
│   ├── Minigame.svelte       # Terminal hacking game component
│   └── Minimap.svelte        # SVG network minimap component
└── routes/
    ├── +layout.svelte        # Root layout (favicon inject, no functions)
    └── +page.svelte          # Main page — canvas loop, phase controller
```

---

## File-by-File Function Index

---

### `src/lib/audio/context.js`

| Function | Signature | Description |
|---|---|---|
| `getCtx` | `() → AudioContext` | Gets or lazily creates the shared `AudioContext`; resumes it if suspended. |
| `ensureAudio` | `() → void` | Call from a user gesture to satisfy browser autoplay policy; delegates to `getCtx`. |

---

### `src/lib/audio/keys.js`

| Function | Signature | Description |
|---|---|---|
| `playKeystroke` | `() → void` | 40 ms filtered white-noise burst with random bandpass (2.5–4 kHz) simulating a key click. |
| `playSubmit` | `() → void` | Short square-wave burst with a pitch jump (880 → 1760 Hz) for the Enter key. |
| `playBlink` | `() → void` | 50 ms soft sine sweep (600 → 400 Hz) used for eye-blink animation sound. |
| `playBackspace` | `() → void` | 60 ms sine sweep (800 → 300 Hz) for Backspace key. |

---

### `src/lib/audio/beats.js`

Module-private helpers (not exported):

| Function | Signature | Description |
|---|---|---|
| `getLayerCount` | `() → number` | Returns the effective number of active beat layers (`timeFloor + detectionExtra`, clamped). |
| `getActiveLayers` | `() → string[]` | Returns the slice of `LAYER_ORDER` that is currently playing. |
| `buildPattern` | `() → string \| null` | Builds a Strudel `stack(...)` pattern string from the active layers. |
| `evaluatePattern` | `async () → void` | Sends the current pattern to the Strudel REPL, skipping duplicate evaluations. |

Exported functions:

| Function | Signature | Description |
|---|---|---|
| `initBeats` | `async () → void` | Loads Strudel, initialises audio, registers custom DSP functions. Idempotent (cached promise). |
| `addLayer` | `async (name: string) → void` | Raises `timeFloor` to include the named layer and re-evaluates the pattern. |
| `updateBeatsForDetection` | `async (detection: number) → void` | Adds extra layers above `timeFloor` based on a 0–1 detection score; also scales BPM. |
| `transitionDown` | `() → Promise<void>` | Stops Strudel and plays a 400 ms sawtooth pitch-down SFX; resets all layer state. |
| `resetToKick` | `async () → void` | Resets to kick-only layer (timeFloor = 1) and re-evaluates pattern. |
| `crashBeats` | `() → void` | Stops Strudel abruptly and plays a crushed-noise crash SFX (500 ms). |
| `playDeathSynth` | `() → void` | Plays a 1.5 s distorted sawtooth pitch-down synth for the DEATH screen. |
| `stopBeats` | `() → void` | Cleanly stops Strudel and resets all layer/BPM state. |

---

### `src/lib/audio/index.js`

Barrel re-export only — no functions defined here.

---

### `src/lib/audio/prebake.js`

Contains exported string constants `REGISTERED_FUNCTIONS` and `WINDOW_FUNCTIONS` (Strudel DSP code evaluated at runtime). No JavaScript functions.

---

### `src/lib/characters.js`

| Function | Signature | Description |
|---|---|---|
| `createCharArrays` | `(total: number) → { charIndices, shuffleTimers, charAges }` | Allocates typed arrays for per-cell character index, shuffle countdown, and age tracking. |
| `updateShuffleTimers` | `(charIndices, shuffleTimers, charAges, idx, dt) → void` | Advances age, counts down shuffle timer, and picks a new random character when the timer fires. |
| `ageBrightnessBoost` | `(charAges, idx) → number` | Returns a brightness bonus (0 → `AGE_BRIGHTNESS_BOOST × BRIGHTNESS_LEVELS`) that fades in as a cell matures. |

---

### `src/lib/constants.js`

Exports only constants and data arrays (`SPEED`, `FONT_SIZE`, `PALETTES`, `WORDS`, etc.). No functions.

---

### `src/lib/effects.js`

| Function | Signature | Description |
|---|---|---|
| `createEffectsState` | `() → object` | Returns a fresh effects state object (cursor position, ripple list, glow params, clear zone). |
| `updateCursor` | `(state, clientX, clientY, cellW, cellH) → void` | Updates the cursor grid position from screen coordinates. |
| `clearCursor` | `(state) → void` | Marks the cursor as inactive (mouse left). |
| `spawnRipple` | `(state, col, row) → void` | Appends a new ripple at the given grid cell; evicts oldest if more than 10 exist. |
| `updateEffects` | `(state, dt) → void` | Advances ripple radii/ages and prunes expired ripples each frame. |
| `cellBrightnessModifier` | `(state, col, row) → number` | Returns a brightness delta for a cell: `-Infinity` inside a clear zone, glow falloff near cursor, ring pulse from ripples. |

---

### `src/lib/headers.js`

| Function | Signature | Description |
|---|---|---|
| `pruneHeaders` | `(headers, now) → Header[]` | Filters out headers whose fade animation has fully completed. |
| `fadeAllHeaders` | `(headers, now) → void` | Starts the fade timer on any header that isn't already fading. |
| `spawnHeader` | `(ctx, canvasWidth, canvasHeight, fontFamily) → Header` | Creates a new header at a random position with a random word from `WORDS`. |
| `spawnHeaderWithWord` | `(ctx, canvasWidth, canvasHeight, fontFamily, word) → Header` | Same as `spawnHeader` but with a specific word (used for the `DEATH` header). |
| `renderHeaders` | `(ctx, headers, colorStrings, fontFamily, now) → void` | Draws each header with a scramble-decode animation and fade-out alpha. |

---

### `src/lib/noise.js`

| Function | Signature | Description |
|---|---|---|
| `createNoise` | `(frequency?: number) → FastNoiseLite` | Creates a `FastNoiseLite` instance with Cellular type at the given frequency (default 0.02). |
| `randomizeNoise` | `(noise: FastNoiseLite) → void` | Randomises the noise type, cellular distance function, return type, and jitter. |
| `sampleNoise` | `(noise, col, row, offsetX, offsetY) → number` | Samples noise at `(col × NOISE_SCALE + offsetX, row × NOISE_SCALE + offsetY)` and remaps from [-1,1] to [0,1]. |

---

### `src/lib/palette.js`

| Function | Signature | Description |
|---|---|---|
| `buildColorStrings` | `(baseColor: number[]) → string[]` | Builds an array of `BRIGHTNESS_LEVELS` RGB strings from black to ~55 % brightness of `baseColor`. |
| `randomPalette` | `() → number[]` | Returns a random `[r,g,b]` entry from the `PALETTES` constant. |
| `randomFont` | `() → string` | Returns a random font name from the `FONTS` constant. |
| `createColorMorph` | `(fromColor, toColor, duration) → object` | Creates a morph descriptor with `from`, `to`, `progress`, and `duration`. |
| `updateColorMorph` | `(morph, dt) → boolean` | Advances `morph.progress` by `dt/duration`; returns `true` when complete. |
| `buildMorphedColorStrings` | `(morph) → string[]` | Interpolates the current morph color via smoothstep and delegates to `buildColorStrings`. |

---

### `src/lib/randomize.js`

| Function | Signature | Description |
|---|---|---|
| `randomize` | `(state, options?) → state` | All-in-one scene randomizer: new direction, noise, color morph, font, grid dimensions, render mode, and header. Mutates and returns the state object. Throttled to one call per 300 ms. |

---

### `src/lib/renderer.js`

| Function | Signature | Description |
|---|---|---|
| `measureGrid` | `(ctx, fontFamily) → { cols, rows, charWidth, cellW, cellH }` | Measures cell size from the canvas context and computes how many columns/rows fill the viewport. |
| `sizeCanvas` | `(canvas, cols, cellW, rows, cellH) → void` | Sets `canvas.width` and `canvas.height` to the exact pixel dimensions of the character grid. |

---

### `src/lib/index.js`

Barrel re-export only — no functions defined here.

---

### `src/lib/modes/fractal.js`

Render mode — Julia-set fractal blended with noise.

| Function | Signature | Description |
|---|---|---|
| `init` | `(ctx, noise, cols, rows, colorStrings, fontFamily) → state` | Picks a random Julia constant `c`, zoom level, and center offset. |
| `update` | `(state, dt, offset, noise, cols, rows) → void` | No-op — the fractal is static between `randomize` calls. |
| `render` | `(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState) → void` | Iterates each cell through the Julia set, blends with noise, buckets by brightness, and draws characters. |

---

### `src/lib/modes/grid.js`

Render mode — noise-driven character grid with per-cell shuffle.

| Function | Signature | Description |
|---|---|---|
| `init` | `(ctx, noise, cols, rows, colorStrings, fontFamily) → state` | Allocates per-cell character index, shuffle timer, and age arrays via `createCharArrays`. |
| `update` | `(state, dt, offset, noise, cols, rows) → void` | No-op — shuffle timers are updated inline during `render`. |
| `render` | `(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState) → void` | Samples noise per cell, updates shuffle timers, applies age/effect brightness, and draws characters via bucket sort. |

---

### `src/lib/modes/multilayer.js`

Render mode — multiple noise frequencies blended together.

| Function | Signature | Description |
|---|---|---|
| `init` | `(ctx, noise, cols, rows, colorStrings, fontFamily) → state` | Creates three additional `FastNoiseLite` instances at different frequencies with blend weights. |
| `update` | `(state, dt, offset, noise, cols, rows) → void` | No-op. |
| `render` | `(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState) → void` | Blends the primary noise with three extra layers (weighted sum), buckets results, and draws characters. |

---

### `src/lib/modes/particles.js`

Render mode — noise-field-steered particles.

| Function | Signature | Description |
|---|---|---|
| `init` | `(ctx, noise, cols, rows, colorStrings, fontFamily) → state` | Spawns an initial set of particles (≥ 50, ≈ 5 % of grid cells). |
| `spawnParticle` *(private)* | `(cols, rows) → particle` | Returns a new particle with random position, lifetime (2–6 s), and character index. |
| `update` | `(state, dt, offset, noise, cols, rows) → void` | Moves each particle along the noise-field angle, respawns expired or out-of-bounds particles, and randomly cycles their character. |
| `render` | `(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState) → void` | Buckets each particle by brightness (with life-ratio fade), applies effect modifiers, and draws characters. |

---

### `src/lib/modes/terrain.js`

Render mode — block-character noise terrain.

| Function | Signature | Description |
|---|---|---|
| `init` | `(ctx, noise, cols, rows, colorStrings, fontFamily) → state` | Returns empty state (`{}`). |
| `update` | `(state, dt, offset, noise, cols, rows) → void` | No-op — terrain is purely noise-driven. |
| `render` | `(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState) → void` | Maps noise per cell to a block character (`░▒▓█`), buckets by brightness, and draws. |

---

### `src/lib/modes/index.js`

| Function | Signature | Description |
|---|---|---|
| `randomMode` | `(currentName?: string) → mode` | Picks a random mode object from `MODES`, avoiding the currently active mode if possible. |

---

### `src/lib/game/modifiers.js`

| Function | Signature | Description |
|---|---|---|
| `getModifier` | `(word: string) → ModifierConfig` | Looks up the modifier config keyed by a decoded word (e.g. `"NEURAL"`, `"FLUX"`); returns a blank config for unknown words. |
| `MODIFIERS` | `Record<string, ModifierConfig>` (exported const) | Full map of all modifier configs, keyed by modifier name. |

---

### `src/lib/game/network.js`

| Function | Signature | Description |
|---|---|---|
| `generateName` | `(typeInt: number) → string` | Generates a node name like `SRV_07` or `CAM_ALPHA` from the node type prefix and a random suffix. |
| `generateTraceName` | `() → string` | Generates a tracer program name following the same convention as nodes (`TRC_07` or `TRC_ALPHA`). Used by `spawnTrace` to give each tracer a unique name. |
| `generateNetwork` | `(mod?: ModifierConfig) → Network` | Procedurally generates a connected graph of security nodes: random spanning tree + extra edges, target marking, ICE traps, server guarantees, and BREACH/CIPHER modifier support. |
| `nodeByName` | `(net, name: string) → Node \| undefined` | Finds a node by its name string. |
| `getNode` | `(net, id: number) → Node \| undefined` | Returns the node with the given numeric ID, with bounds check. |
| `addEdge` *(private)* | `(nodes, a, b) → void` | Adds a **bidirectional** edge between nodes `a` and `b`. |
| `addDirectedEdge` *(private)* | `(nodes, a, b) → void` | Adds a **one-way** edge from `a` to `b`. |
| `hasEdge` *(private)* | `(node, target) → boolean` | Returns `true` if `node.edges` contains `target`. |
| `rewireEdge` | `(net: Network) → void` | Removes a random non-bridge edge and adds a new random edge (used by the FLUX modifier). |
| `bfs` | `(net, startId, endId) → number[]` | BFS shortest-path search; returns the node-ID path or `[]` if unreachable. |

---

### `src/lib/game/player.js`

| Function | Signature | Description |
|---|---|---|
| `newPlayer` | `(net, mod?) → Player` | Creates a player starting at a node ≥ 2 hops from the Overlord, with 10–20 starting DATA and optional detection offset. |
| `isAlive` | `(player) → boolean` | Returns `true` if detection < 100%. DATA depletion is not a loss condition. |
| `loseReason` | `(player) → string` | Returns `'DETECTED BY OVERLORD'` if detection ≥ 100%, otherwise `'NETWORK LOST'` as a fallback. DATA depletion no longer triggers a loss. |
| `spawnTrace` | `(gs) → void` | Spawns a new Trace program at the Overlord node with a unique name (via `generateTraceName`, retrying if name already taken) and appends it to `gs.traces`. |
| `moveTraces` | `(gs) → string[]` | Moves all active traces (BFS-chase at high detection, random at low), applies contact detection penalty (+25% or mod override), includes tracer name and `destroy_<name>` hint in contact messages. Tracers are no longer destroyed automatically on contact — they must be destroyed via `destroy_<tracer>` from a cracked Turret. |
| `newRival` | `(net, playerStart, mod?) → Rival` | Creates a rival hacker starting at a random non-player, non-Overlord node with a configurable move interval and `phase: 'moving'`. |
| `moveRival` | `(gs) → string[]` | Drives a four-phase state machine per move-tick: **moving** (BFS toward nearest un-spiked target — checks both `isTarget` and `_isTargetInternal` so the rival always knows real targets even in QUBIT mode, one step per `moveInterval` turns) → **cracking** (sets `NodeState.Cracked`; if node is already `Spiked` by the player, aborts: emits Overlord-noticed message, +10% detection, and spawns a new tracer from the Overlord if not neutralized) → **spiking** (if node already `Spiked` by player, aborts same way; otherwise sets `NodeState.Spiked`, increments `spikedTargets`; if target is a Server, advances to **extracting**, otherwise resets to **moving**) → **extracting** (sets `node.extracted`, resets to **moving**). Returns warning messages. |
| `newOverlord` | `(mod?) → OverlordState` | Creates Overlord state; can start active immediately if the `EGO` modifier is set. |
| `overlordCheck` | `(overlord, player, net, mod?) → string` | On each hop, probabilistically applies one of three Overlord punishments (detection surge, data drain, node lockout) scaled by hop count and modifier. |

---

### `src/lib/game/commands.js`

Private helpers (not exported):

| Function | Description |
|---|---|
| `cmdHelp(gs)` | Returns help text lines listing all commands and their costs, including active modifier info. |
| `cmdStatus(gs)` | Returns a single status line (DATA, detection %, current node, spike count, cloak turns, traces, rival, action limit). |
| `nodeEntryType(node, gs)` | Maps a node's state/role to a history entry colour type. |
| `cmdMap(gs)` | Renders the discovered network as an ASCII tree with markers for current position, cracks, spikes, traces, rival, ICE, and extracted nodes. |
| `cmdScan(gs)` | Reveals undiscovered neighbours of the current node (costs DATA). |
| `cmdHop(gs, args)` | Moves the player to a named node (adjacency check, free-revisit logic, SOCKET hop-anywhere, detection penalty, Overlord check). |
| `cmdCrack(gs, args)` | Cracks the current node (variable DATA cost by type), handles Overlord neutralise, QUBIT target reveal, and ICE traps. Supports `crack <node>` for better feedback if args are provided. |
| `cmdSpike(gs, args)` | Plants a spike on a cracked target node; checks win condition (`player.spikeCount + rival.spikedTargets >= targetCount`). In QUBIT mode, if the node was cracked by the rival hacker (`_isTargetInternal=true`, `state=Cracked`), promotes it to `isTarget=true` before the target check. Supports `spike <node>` with distance validation. |
| `cmdCloak(gs)` | Activates 3-turn cloak (costs DATA, free with PULSE modifier). |
| `cmdKill(gs)` | Eliminates the rival hacker at the player's current node (costs 2 DATA, gains 10). |
| `cmdExtract(gs)` | Extracts data from a cracked Server node for a random DATA reward. |
| `cmdPass(gs)` | Idle cycle: +1 DATA, +5 % detection. |
| `cmdFeed(gs)` | Access camera feed to reveal adjacent nodes and gain passive data (Camera node must be cracked/spiked). |
| `cmdJam(gs)` | Jam nearby signals to suppress hop detection on connected nodes (Turret node must be cracked/spiked). |
| `cmdDestroy(gs, tracerName)` | Destroy a named tracer program using a cracked/spiked Turret node. Invoked via `destroy_<tracer_name>`. |
| `cmdBridge(gs, args)` | Creates a bidirectional edge between two discovered nodes (Door node must be cracked/spiked). |
| `cmdSniff(gs)` | Reveals rival location and blocks the next trace spawn (Comms node must be cracked/spiked). |
| `cmdRelay(gs, args)` | Redirects a trace program to another node (Comms node must be spiked). |
| `cmdDrain(gs)` | Gain 2 DATA and +5% detection (Power node must be cracked/spiked). |
| `cmdOverload(gs)` | Clears ICE from adjacent nodes and makes the next crack free (Power node must be spiked). |
| `cmdBypass(gs, args)` | Unlocks an adjacent locked node (Firewall node must be cracked/spiked). |
| `cmdShatter(gs)` | Unlocks all locked nodes across the network (Firewall node must be spiked). |
| `postTurnEffects(gs)` | After each action: moves traces, spawns new traces on hop intervals, moves rival, checks the combined win condition (player spikes + rival extractions ≥ target count), then checks rival loss condition (rival extracted > half of targets, scaled from `mod.targetCount`). Sets `gs.lost` only (not `gs.killed`) so no death animation plays. |
| `cmdSudoRm(gs)` | Easter egg — immediately kills and loses. |
| `cmdDevChangeMod(gs, modName)` | DEV command — changes `gs.mod` to the named modifier at runtime. Invoked via `dev_changemod_<MOD_NAME>` in the terminal (e.g. `dev_changemod_QUBIT`). Pass `NONE` or an empty suffix to clear the modifier. Calls `reconcileModChange` before swapping `gs.mod`. Prints available modifier names on bad input. |
| `reconcileModChange(gs, oldMod, newMod, entries)` | Reconciles live network/player/rival/overlord state after a dev modifier swap. Handles: `hiddenTargets` (hides/reveals un-cracked targets for QUBIT); `overlordIsTarget` (marks/unmarks Overlord node); `overlordImmediate` (activates Overlord for EGO); `allDiscovered` (sets Undiscovered nodes to Discovered for BREACH); `rivalMoveInterval` (clamps rival move counter). Emits a warning for structural properties (`noServers`, `directedEdges`, `minNodes/maxNodes`, `targetCount`) that cannot be applied to a live network. |

Exported functions:

| Function | Signature | Description |
|---|---|---|
| `newGameState` | `(word?: string) → GameState` | Creates a fresh game state: generates network, player, overlord, rival, and applies the word modifier. |
| `execute` | `(gs, input: string) → HistoryEntry[]` | Parses a command string, dispatches to the matching `cmd*` handler, applies post-turn effects (passive detection, FLUX rewire, EPOCH limit), and returns history entries. |
| `buildGameOverEntries` | `(gs) → HistoryEntry[]` | Builds the win/loss ASCII banner and final stats summary as history entries. Loss reason is derived from full `gs` state: `'DETECTED BY OVERLORD'` (detection), `'NETWORK COMPROMISED'` (rival over-extraction), or `loseReason` fallback. |

---

### `src/lib/Intro.svelte` — Script Functions

> **Pointer-event note:** `.intro-overlay` is always `pointer-events: none`; only `.intro-container` (the dialogue box) has `pointer-events: auto`. This allows canvas clicks (ripple effect) to pass through the overlay background at all times during the intro.

| Function | Description |
|---|---|
| `wait(ms)` | Promise-based timeout helper. |
| `typeOut(text, setter, speed?)` | Types a string character-by-character into a reactive setter, playing a keystroke sound each step. |
| `playNode(nodeId)` | Drives a single dialogue node: blink, eye state, title, type text, show staggered buttons or auto-advance. |
| `handleConnect()` | Click handler for the `[connect to network]` button — ensures audio, fires Strudel init, starts the sequence. |
| `handleButtonClick(nextNodeId)` | Dialogue button click — fades out current buttons, adds the kick layer on first click, then plays the next node. |
| `runSequence()` | Top-level intro animation: fade transitions → eyes-open blink sequence → types "hey" → enters dialogue. |

---

### `src/lib/Minigame.svelte` — Script Functions

| Function | Description |
|---|---|
| `runBootSequence()` | Animates the connecting boot lines, then switches to the active phase and populates initial history. |
| `submitCommand()` | Reads `inputText`, calls `execute()`, updates audio layers based on detection delta, handles win/kill/loss transitions. |
| `playAgain()` | Resets game state and restarts the boot sequence. |
| `focusInput()` | Focuses the hidden real input when the terminal frame is clicked. |
| `handleInputKeydown(e)` | Plays audio SFX on Enter / Backspace / any character key and calls `submitCommand` on Enter. |
| `entryColor(type)` | Maps a `HistoryEntry` type string to a CSS colour string. |

---

### `src/lib/Minimap.svelte` — Script Functions

| Function | Description |
|---|---|
| `detectEdges(e)` | Returns `{ left, bottom }` flags indicating whether the pointer is within `EDGE_THRESHOLD` px of a resizable edge. |
| `edgeCursor(edges)` | Maps an edge-flag object to a CSS cursor string. |
| `onPointerDown(e)` | Starts a resize or pan interaction depending on where the pointer lands. |
| `onPointerMove(e)` | Updates map dimensions (resize) or viewBox origin (pan) during a drag. |
| `onPointerUp()` | Ends any active resize or pan interaction. |
| `onContainerMove(e)` | Updates the cursor style on hover based on edge proximity. |
| `onWheel(e)` | Zoom-to-pointer: adjusts `zoom`, `viewX`, and `viewY` so the point under the cursor stays fixed. |
| `computeLayout(net)` | Force-directed graph layout: 80 iterations of repulsion + edge attraction + center gravity, clamped to bounds. |
| `nodeShape(type, cx, cy, r)` | Returns an SVG path string (or `'circle'`) for a node's shape based on its `NodeType`. |
| `nodeStyle(node)` | Returns `{ fill, stroke, className }` for a node based on its `NodeState` and whether it is the current player node. |

---

### `src/routes/+page.svelte` — Script Functions

| Function | Description |
|---|---|
| `renderTerminalBorder(c, zone, cw, ch, colors, font)` | Draws a box-drawing border (┌─┐│└─┘) around the terminal clear zone on the canvas. |
| `computeFullClearZone()` | Computes the clear zone dimensions (centered, based on the terminal's max-width/height and current grid cell size). |
| `init()` | Sets up the canvas context, measures the grid, sizes the canvas, builds colour strings, and initialises the current render mode. |
| `animate(timestamp)` | Main `requestAnimationFrame` loop: color morphing, effects update, decoding/clearing/game phase logic, canvas clear, mode update+render, header render, border render. |
| `handle_keydown(e)` | Triggers `randomize_direction()` on Enter during the intro phase. |
| `randomize_direction(options?)` | Wraps `randomize()` with the current scene state object and destructures the result back into local variables. |
| `kill_effect()` | Switches to red palette, picks new mode, spawns a `DEATH` header, and plays the death synth — used when the player is killed. |
| `handle_mousemove(e)` | Updates cursor position in effects state. |
| `handle_mouseleave()` | Clears cursor from effects state. |
| `handle_click(e)` | Spawns a ripple effect at the clicked grid cell. |
| `handle_touchstart(e)` | Handles first touch: updates cursor and spawns ripple. |
| `handle_touchmove(e)` | Updates cursor and spawns ripple as the touch moves. |
| `handle_resize()` | Cancels the current animation frame, re-initialises the grid, and restarts the loop. |

---

## Key Data Types

| Type | Defined In | Description |
|---|---|---|
| `Node` | `game/network.js` | `{ id, name, type, state, isTarget, extracted, ice, edges }` |
| `Network` | `game/network.js` | `{ nodes: Node[], directed?: boolean }` |
| `Player` | `game/player.js` | `{ data, detection, currentNode, cloakTurns, hopCount, spikeCount, visitedNodes }` |
| `OverlordState` | `game/player.js` | `{ active, neutralized }` |
| `Trace` | `game/player.js` | `{ id, name, currentNode, moveCooldown }` |
| `Rival` | `game/player.js` | `{ currentNode, moveCounter, targetNode, phase, spikedTargets }` |
| `GameState` | `game/commands.js` | Full game snapshot: network, player, overlord, traces, rival, mod, won, lost, killed, score, actionCount |
| `HistoryEntry` | `game/commands.js` | `{ text: string, type: string }` |
| `ModifierConfig` | `game/modifiers.js` | Arbitrary config record keyed by word (e.g. `NEURAL`, `FLUX`) |
---

## Loss Conditions

| # | Condition | Where enforced | Notes |
|---|---|---|---|
| 1 | Detection reaches 100% | `isAlive` check in `execute` (after every action) | Sets `gs.killed = true` and `gs.lost = true`; triggers death animation in `Minigame.svelte`. Also the terminal state for the EPOCH modifier (action limit sets detection to 100%). |
| 2 | Rival extracts more than half of available targets | `postTurnEffects` in `commands.js` | Threshold: `rival.extractedTargets > targetCount / 2`. Reads `mod.targetCount` so it scales with KERNEL/SHARD (4 targets → threshold > 2). Sets `gs.lost` only — no death animation. |
| 3 | Per-level / modifier events | Varies | Currently: EPOCH sets detection to 100% on action-limit breach (routes through condition 1). `sudo rm -rf user` easter egg sets both `killed` and `lost` directly. |

