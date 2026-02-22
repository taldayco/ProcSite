<script>
import { onMount } from "svelte";
import { SPEED, FONT_SIZE, GAP, COLOR_MORPH_DURATION, DECODE_DURATION, FADE_DURATION } from "$lib/constants.js";
import { buildColorStrings, randomPalette, randomFont, createColorMorph, updateColorMorph, buildMorphedColorStrings } from "$lib/palette.js";
import { createNoise, randomizeNoise } from "$lib/noise.js";
import { measureGrid, sizeCanvas } from "$lib/renderer.js";
import { pruneHeaders, fadeAllHeaders, spawnHeader, spawnHeaderWithWord, renderHeaders } from "$lib/headers.js";
import { randomMode } from "$lib/modes/index.js";
import { createEffectsState, updateCursor, clearCursor, spawnRipple, updateEffects } from "$lib/effects.js";
import { randomize } from "$lib/randomize.js";
import Intro from "$lib/Intro.svelte";
import Minigame from "$lib/Minigame.svelte";

let phase = $state('intro');
let clearProgress = 0;
const CLEAR_DURATION = 0.8;

// Kill auto-reset state
let killHeaderTime = 0;

// Decoding phase state
let decodeStartTime = 0;
let randomizeFired = 0;
let lastDecodedWord = '';
const RANDOMIZE_COUNT = 5;
const RANDOMIZE_INTERVAL = 200;

/** @type {HTMLCanvasElement} */
let canvas;

/** @type {CanvasRenderingContext2D} */
let ctx;
/** @type {import('fastnoise-lite').default} */
let noise;
let offsetX = 0, offsetY = 0;
let angle = Math.random() * 2 * Math.PI;
let dx = Math.cos(angle), dy = Math.sin(angle);
let lastTime = 0;
/** @type {number} */
let animFrameId;
let lastDirectionChange = 0;

let cols = 0, rows = 0, charWidth = 0;
let cellW = 0, cellH = 0;
/** @type {number[]} */
let baseColor = [0, 255, 70];
let fontFamily = 'monospace';
/** @type {string[]} */
let colorStrings = [];
/** @type {import('$lib/headers.js').Header[]} */
let activeHeaders = [];

/** @type {{ name: string, init: Function, update: Function, render: Function }} */
let currentMode;
/** @type {any} */
let modeState;

/** @type {ReturnType<typeof createColorMorph> | null} */
let colorMorph = null;

/** @type {ReturnType<typeof createEffectsState>} */
let effectsState;

/**
 * Draw box-drawing border around the clear zone on the canvas.
 * @param {CanvasRenderingContext2D} c
 * @param {{ centerCol: number, centerRow: number, halfW: number, halfH: number }} zone
 * @param {number} cw
 * @param {number} ch
 * @param {string[]} colors
 * @param {string} font
 */
function renderTerminalBorder(c, zone, cw, ch, colors, font) {
  const left = Math.floor(zone.centerCol - zone.halfW);
  const right = Math.ceil(zone.centerCol + zone.halfW);
  const top = Math.floor(zone.centerRow - zone.halfH);
  const bottom = Math.ceil(zone.centerRow + zone.halfH);

  c.save();
  c.font = `${FONT_SIZE}px ${font}`;
  c.textBaseline = 'top';
  c.fillStyle = colors[Math.min(4, colors.length - 1)];

  // Top edge: ┌─...─┐
  c.fillText('┌', left * cw, top * ch);
  for (let col = left + 1; col < right; col++) {
    c.fillText('─', col * cw, top * ch);
  }
  c.fillText('┐', right * cw, top * ch);

  // Bottom edge: └─...─┘
  c.fillText('└', left * cw, bottom * ch);
  for (let col = left + 1; col < right; col++) {
    c.fillText('─', col * cw, bottom * ch);
  }
  c.fillText('┘', right * cw, bottom * ch);

  // Left and right sides: │
  for (let row = top + 1; row < bottom; row++) {
    c.fillText('│', left * cw, row * ch);
    c.fillText('│', right * cw, row * ch);
  }

  c.restore();
}

/**
 * Compute the full-size clear zone dimensions from the current viewport and grid.
 */
function computeFullClearZone() {
  const centerCol = cols / 2;
  const centerRow = rows / 2;
  // Terminal is max-width:800px, max-height:min(600, 80vh), plus overlay padding (1rem = 16px each side)
  const termWidthPx = Math.min(800, window.innerWidth - 32);
  const termHeightPx = Math.min(600, window.innerHeight * 0.8);
  return {
    centerCol,
    centerRow,
    halfW: termWidthPx / (2 * cellW) + 1,
    halfH: termHeightPx / (2 * cellH) + 1,
  };
}

function init() {
  ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const grid = measureGrid(ctx, fontFamily);
  cols = grid.cols;
  rows = grid.rows;
  charWidth = grid.charWidth;
  cellW = grid.cellW;
  cellH = grid.cellH;

  sizeCanvas(canvas, cols, grid.cellW, rows, grid.cellH);

  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  colorStrings = buildColorStrings(baseColor);

  if (!currentMode) {
    currentMode = randomMode();
  }
  modeState = currentMode.init(ctx, noise, cols, rows, colorStrings, fontFamily);
}

/** @param {number} timestamp */
function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  // Color morphing
  if (colorMorph) {
    const done = updateColorMorph(colorMorph, dt);
    colorStrings = buildMorphedColorStrings(colorMorph);
    if (done) {
      baseColor = colorMorph.to;
      colorMorph = null;
    }
  }

  updateEffects(effectsState, dt);

  // Decoding phase: fire randomize bursts, then wait for final decode
  if (phase === 'decoding') {
    // Shrink clear zone if it exists (returning from game via dev_cheat)
    if (effectsState.clearZone) {
      clearProgress = Math.max(clearProgress - dt / CLEAR_DURATION, 0);
      const zone = computeFullClearZone();
      const t = clearProgress;
      const eased = t * t * (3 - 2 * t);
      effectsState.clearZone = {
        centerCol: zone.centerCol,
        centerRow: zone.centerRow,
        halfW: zone.halfW * eased,
        halfH: zone.halfH * eased,
      };
      if (clearProgress <= 0) {
        effectsState.clearZone = null;
      }
    }

    const elapsed = performance.now() - decodeStartTime;
    // Fire additional randomize bursts at each interval
    while (randomizeFired < RANDOMIZE_COUNT && elapsed >= randomizeFired * RANDOMIZE_INTERVAL) {
      randomize_direction();
      randomizeFired++;
    }
    // After all bursts fired, wait for final header to finish decoding
    if (randomizeFired >= RANDOMIZE_COUNT) {
      const lastHeader = activeHeaders[activeHeaders.length - 1];
      if (lastHeader && performance.now() - lastHeader.startTime >= DECODE_DURATION) {
        // Start fading the last header if not already fading
        if (lastHeader.fadeStartTime == null) {
          lastHeader.fadeStartTime = performance.now();
          lastDecodedWord = lastHeader.word;
        }
        // Wait for fade to complete before clearing
        if (performance.now() - lastHeader.fadeStartTime >= FADE_DURATION) {
          clearProgress = 0;
          phase = 'clearing';
        }
      }
    }
  }

  // Kill auto-reset: after DEATH header decodes + 200ms, return to intro
  if (killHeaderTime > 0 && performance.now() - killHeaderTime >= DECODE_DURATION + 600) {
    phase = 'intro';
    effectsState.clearZone = null;
    killHeaderTime = 0;
    fadeAllHeaders(activeHeaders, performance.now());
  }

  // Clear zone animation
  if (phase === 'clearing') {
    clearProgress = Math.min(clearProgress + dt / CLEAR_DURATION, 1);
    const zone = computeFullClearZone();
    // Smoothstep easing
    const t = clearProgress;
    const eased = t * t * (3 - 2 * t);
    effectsState.clearZone = {
      centerCol: zone.centerCol,
      centerRow: zone.centerRow,
      halfW: zone.halfW * eased,
      halfH: zone.halfH * eased,
    };
    if (clearProgress >= 1) {
      phase = 'game';
    }
  }

  // Keep clear zone in sync with viewport during game
  if (phase === 'game') {
    effectsState.clearZone = computeFullClearZone();
  }

  offsetX += dx * SPEED * dt;
  offsetY += dy * SPEED * dt;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offset = { x: offsetX, y: offsetY };
  currentMode.update(modeState, dt, offset, noise, cols, rows);
  currentMode.render(ctx, modeState, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState);

  const now = performance.now();
  activeHeaders = pruneHeaders(activeHeaders, now);
  renderHeaders(ctx, activeHeaders, colorStrings, fontFamily, now);

  if (effectsState.clearZone && (phase === 'clearing' || phase === 'game')) {
    renderTerminalBorder(ctx, effectsState.clearZone, cellW, cellH, colorStrings, fontFamily);
  }

  animFrameId = requestAnimationFrame(animate);
}

/** @param {KeyboardEvent} e */
function handle_keydown(e) {
  if (phase !== 'intro') return;
  if (e.key === 'Enter') randomize_direction();
}

/** @param {{ skipHeaders?: boolean }} [options] */
function randomize_direction(options) {
  const state = randomize({
    lastDirectionChange, angle, dx, dy, noise, baseColor, colorMorph,
    fontFamily, ctx, canvas, cols, rows, charWidth, cellW, cellH,
    colorStrings, currentMode, modeState, activeHeaders
  }, options);
  ({ lastDirectionChange, angle, dx, dy, colorMorph, fontFamily,
    cols, rows, charWidth, cellW, cellH, currentMode, modeState } = state);
}

function kill_effect() {
  const now = performance.now();
  if (now - lastDirectionChange < 300) return;
  lastDirectionChange = now;

  angle = Math.random() * 2 * Math.PI;
  dx = Math.cos(angle);
  dy = Math.sin(angle);

  randomizeNoise(noise);

  colorMorph = createColorMorph(baseColor, [255, 50, 50], COLOR_MORPH_DURATION);
  fontFamily = randomFont();

  const grid = measureGrid(ctx, fontFamily);
  cols = grid.cols;
  rows = grid.rows;
  charWidth = grid.charWidth;
  cellW = grid.cellW;
  cellH = grid.cellH;
  sizeCanvas(canvas, cols, grid.cellW, rows, grid.cellH);
  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  currentMode = randomMode(currentMode.name);
  modeState = currentMode.init(ctx, noise, cols, rows, colorStrings, fontFamily);

  fadeAllHeaders(activeHeaders, now);
  activeHeaders.push(spawnHeaderWithWord(ctx, canvas.width, canvas.height, fontFamily, 'DEATH'));
  killHeaderTime = performance.now();
}

/** @param {MouseEvent} e */
function handle_mousemove(e) {
  updateCursor(effectsState, e.clientX, e.clientY, cellW, cellH);
}

function handle_mouseleave() {
  clearCursor(effectsState);
}

/** @param {MouseEvent} e */
function handle_click(e) {
  const col = e.clientX / cellW;
  const row = e.clientY / cellH;
  spawnRipple(effectsState, col, row);
}

/** @param {TouchEvent} e */
function handle_touchstart(e) {
  const t = e.touches[0];
  if (t) {
    const col = t.clientX / cellW;
    const row = t.clientY / cellH;
    updateCursor(effectsState, t.clientX, t.clientY, cellW, cellH);
    spawnRipple(effectsState, col, row);
  }
}

/** @param {TouchEvent} e */
function handle_touchmove(e) {
  const t = e.touches[0];
  if (t) {
    const col = t.clientX / cellW;
    const row = t.clientY / cellH;
    updateCursor(effectsState, t.clientX, t.clientY, cellW, cellH);
    spawnRipple(effectsState, col, row);
  }
}

function handle_resize() {
  cancelAnimationFrame(animFrameId);
  lastTime = 0;
  init();
  animFrameId = requestAnimationFrame(animate);
}

onMount(() => {
  noise = createNoise();
  effectsState = createEffectsState();
  init();
  animFrameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(animFrameId);
});
</script>

<svelte:window onresize={handle_resize} onkeydown={handle_keydown} />
<canvas
  bind:this={canvas}
  onclick={handle_click}
  onmousemove={handle_mousemove}
  onmouseleave={handle_mouseleave}
  ontouchstart={handle_touchstart}
  ontouchmove={handle_touchmove}
></canvas>

{#if phase === 'intro'}
  <Intro {baseColor} ondone={() => {
    phase = 'decoding';
    randomize_direction();
    decodeStartTime = performance.now();
    randomizeFired = 1;
  }} onkill={kill_effect} />
{:else if phase === 'game'}
  <Minigame {baseColor} decodedWord={lastDecodedWord} ondetection={() => randomize_direction({ skipHeaders: true })} onkill={kill_effect} onnextlevel={() => {
    phase = 'decoding';
    randomize_direction();
    decodeStartTime = performance.now();
    randomizeFired = 1;
  }} />
{/if}

<style>
:global(body) {
  margin: 0;
  overflow: hidden;
  background: #000;
}
canvas {
  display: block;
  width: 100vw;
  height: 100vh;
}
</style>
