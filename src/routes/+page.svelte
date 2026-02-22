<script>
import { onMount } from "svelte";
import { SPEED, FONT_SIZE, GAP } from "$lib/constants.js";
import { buildColorStrings, randomPalette, randomFont } from "$lib/palette.js";
import { createNoise, randomizeNoise } from "$lib/noise.js";
import { measureGrid, sizeCanvas } from "$lib/renderer.js";
import { pruneHeaders, fadeAllHeaders, spawnHeader, renderHeaders } from "$lib/headers.js";
import { randomMode } from "$lib/modes/index.js";

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

function init() {
  ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const grid = measureGrid(ctx, fontFamily);
  cols = grid.cols;
  rows = grid.rows;
  charWidth = grid.charWidth;

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

  offsetX += dx * SPEED * dt;
  offsetY += dy * SPEED * dt;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offset = { x: offsetX, y: offsetY };
  currentMode.update(modeState, dt, offset, noise, cols, rows);
  currentMode.render(ctx, modeState, noise, cols, rows, offset, colorStrings, fontFamily, dt);

  const now = performance.now();
  activeHeaders = pruneHeaders(activeHeaders, now);
  renderHeaders(ctx, activeHeaders, colorStrings, fontFamily, now);

  animFrameId = requestAnimationFrame(animate);
}

function randomize_direction() {
  const now = performance.now();
  if (now - lastDirectionChange < 300) return;
  lastDirectionChange = now;

  angle = Math.random() * 2 * Math.PI;
  dx = Math.cos(angle);
  dy = Math.sin(angle);

  randomizeNoise(noise);

  baseColor = randomPalette();
  fontFamily = randomFont();
  colorStrings = buildColorStrings(baseColor);

  const grid = measureGrid(ctx, fontFamily);
  cols = grid.cols;
  rows = grid.rows;
  charWidth = grid.charWidth;
  sizeCanvas(canvas, cols, grid.cellW, rows, grid.cellH);
  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  // Switch to a new random mode
  currentMode = randomMode(currentMode.name);
  modeState = currentMode.init(ctx, noise, cols, rows, colorStrings, fontFamily);

  fadeAllHeaders(activeHeaders, now);
  activeHeaders.push(spawnHeader(ctx, canvas.width, canvas.height, fontFamily));
}

function handle_resize() {
  cancelAnimationFrame(animFrameId);
  lastTime = 0;
  init();
  animFrameId = requestAnimationFrame(animate);
}

onMount(() => {
  noise = createNoise();
  init();
  animFrameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(animFrameId);
});
</script>

<svelte:window onresize={handle_resize} onkeydown={randomize_direction} onscroll={randomize_direction} />
<canvas
  bind:this={canvas}
  onclick={randomize_direction}
  ontouchstart={randomize_direction}
  ontouchmove={randomize_direction}
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
