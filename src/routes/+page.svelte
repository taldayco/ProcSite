<script>
import { onMount } from "svelte";
import { SPEED, FONT_SIZE, GAP, COLOR_MORPH_DURATION } from "$lib/constants.js";
import { buildColorStrings, randomPalette, randomFont, createColorMorph, updateColorMorph, buildMorphedColorStrings } from "$lib/palette.js";
import { createNoise, randomizeNoise } from "$lib/noise.js";
import { measureGrid, sizeCanvas } from "$lib/renderer.js";
import { pruneHeaders, fadeAllHeaders, spawnHeader, renderHeaders } from "$lib/headers.js";
import { randomMode } from "$lib/modes/index.js";
import { createEffectsState, updateCursor, clearCursor, spawnRipple, updateEffects } from "$lib/effects.js";
import { randomize } from "$lib/randomize.js";

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

  // Effects
  updateEffects(effectsState, dt);

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

  animFrameId = requestAnimationFrame(animate);
}

function randomize_direction() {
  const state = randomize({
    lastDirectionChange, angle, dx, dy, noise, baseColor, colorMorph,
    fontFamily, ctx, canvas, cols, rows, charWidth, cellW, cellH,
    colorStrings, currentMode, modeState, activeHeaders
  });
  ({ lastDirectionChange, angle, dx, dy, colorMorph, fontFamily,
    cols, rows, charWidth, cellW, cellH, currentMode, modeState } = state);
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
  randomize_direction();
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
  randomize_direction();
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
  randomize_direction();
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

<svelte:window onresize={handle_resize} onkeydown={randomize_direction} onscroll={randomize_direction} />
<canvas
  bind:this={canvas}
  onclick={handle_click}
  onmousemove={handle_mousemove}
  onmouseleave={handle_mouseleave}
  ontouchstart={handle_touchstart}
  ontouchmove={handle_touchmove}
  onwheel={randomize_direction}
></canvas>

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
