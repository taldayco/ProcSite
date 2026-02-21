<script>
import { onMount } from "svelte";
import FastNoiseLite from "fastnoise-lite";

let canvas;

const SPEED = 30;
const NOISE_SCALE = 4;
const FONT_SIZE = 14;
const BRIGHTNESS_LEVELS = 16;
const SHUFFLE_MIN = 0.3;
const SHUFFLE_MAX = 2.5;
const GAP = 2;

const PALETTES = [
  [0, 255, 70],    // matrix green
  [0, 220, 255],   // cyan
  [255, 176, 0],   // amber
  [255, 0, 200],   // magenta
  [220, 220, 220], // white
  [255, 50, 50],   // red
];
const FONTS = ['monospace', 'Courier New', 'Consolas', 'Monaco', 'Lucida Console'];

let BASE_COLOR = [0, 255, 70];
let FONT_FAMILY = 'monospace';

const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
  '∀∂∃∅∇∈∉∋∏∑−∗√∝∞∠∧∨∩∪∫≈≠≡≤≥⊂⊃⊆⊇⊕⊗' +
  '│┃┄┅┆┇┈┉─━┌┐└┘├┤┬┴┼╋' +
  '←↑→↓↔↕↖↗↘↙⇐⇒⇑⇓' +
  '■□▪▫▬▲△▶▷▼▽◀◁◆◇○●◎◐◑' +
  '⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏' +
  '₿Ξ¥€£¢₹';

let ctx, noise;
let offsetX = 0, offsetY = 0;
let angle = Math.random() * 2 * Math.PI;
let dx = Math.cos(angle), dy = Math.sin(angle);
let lastTime = 0, animFrameId;
let lastDirectionChange = 0;

let cols = 0, rows = 0, charWidth = 0;
let charIndices, shuffleTimers;
let colorStrings = [];

function buildColorStrings() {
  colorStrings = [];
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) {
    const b = (i + 0.5) / BRIGHTNESS_LEVELS;
    colorStrings.push(`rgb(${Math.floor(BASE_COLOR[0] * b)},${Math.floor(BASE_COLOR[1] * b)},${Math.floor(BASE_COLOR[2] * b)})`);
  }
}

function init() {
  ctx = canvas.getContext('2d');
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  charWidth = ctx.measureText('W').width;

  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  cols = Math.floor(window.innerWidth / cellW);
  rows = Math.floor(window.innerHeight / cellH);

  canvas.width = Math.ceil(cols * cellW);
  canvas.height = rows * cellH;

  // Re-set font after canvas resize (resets context state)
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';

  const total = cols * rows;
  charIndices = new Uint16Array(total);
  shuffleTimers = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    charIndices[i] = Math.floor(Math.random() * CHARS.length);
    shuffleTimers[i] = Math.random() * 2.0;
  }

  buildColorStrings();
}

function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  offsetX += dx * SPEED * dt;
  offsetY += dy * SPEED * dt;

  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bucket characters by brightness level
  // Each bucket stores [col, row, charIndex, col, row, charIndex, ...]
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;

      // Update shuffle timer
      shuffleTimers[idx] -= dt;
      if (shuffleTimers[idx] <= 0) {
        charIndices[idx] = Math.floor(Math.random() * CHARS.length);
        shuffleTimers[idx] = SHUFFLE_MIN + Math.random() * (SHUFFLE_MAX - SHUFFLE_MIN);
      }

      const noiseVal = (noise.GetNoise(col * NOISE_SCALE + offsetX, row * NOISE_SCALE + offsetY) + 1) / 2;
      const bucket = Math.min(Math.floor(noiseVal * BRIGHTNESS_LEVELS), BRIGHTNESS_LEVELS - 1);

      // Skip darkest bucket
      if (bucket === 0) continue;

      buckets[bucket].push(col, row, charIndices[idx]);
    }
  }

  // Draw per bucket
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  for (let b = 1; b < BRIGHTNESS_LEVELS; b++) {
    const arr = buckets[b];
    if (arr.length === 0) continue;
    ctx.fillStyle = colorStrings[b];
    for (let i = 0; i < arr.length; i += 3) {
      ctx.fillText(CHARS[arr[i + 2]], arr[i] * (charWidth + GAP), arr[i + 1] * (FONT_SIZE + GAP));
    }
  }

  animFrameId = requestAnimationFrame(animate);
}

const distanceFunctions = Object.values(FastNoiseLite.CellularDistanceFunction);
const returnTypes = Object.values(FastNoiseLite.CellularReturnType);

function randomize_direction() {
  const now = performance.now();
  if (now - lastDirectionChange < 300) return;
  lastDirectionChange = now;
  angle = Math.random() * 2 * Math.PI;
  dx = Math.cos(angle);
  dy = Math.sin(angle);
  noise.SetCellularDistanceFunction(distanceFunctions[Math.floor(Math.random() * distanceFunctions.length)]);
  noise.SetCellularReturnType(returnTypes[Math.floor(Math.random() * returnTypes.length)]);
  noise.SetCellularJitter(0.2 + Math.random() * 1.3);

  // Randomize color and font
  BASE_COLOR = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  FONT_FAMILY = FONTS[Math.floor(Math.random() * FONTS.length)];
  buildColorStrings();

  // Re-measure and resize grid for new font
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  const newCharWidth = ctx.measureText('W').width;
  const cellW = newCharWidth + GAP;
  const cellH = FONT_SIZE + GAP;
  const newCols = Math.floor(window.innerWidth / cellW);
  const newRows = Math.floor(window.innerHeight / cellH);

  if (newCols !== cols || newRows !== rows) {
    charWidth = newCharWidth;
    cols = newCols;
    rows = newRows;
    canvas.width = Math.ceil(cols * cellW);
    canvas.height = rows * cellH;
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    const total = cols * rows;
    charIndices = new Uint16Array(total);
    shuffleTimers = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      charIndices[i] = Math.floor(Math.random() * CHARS.length);
      shuffleTimers[i] = Math.random() * 2.0;
    }
  } else {
    charWidth = newCharWidth;
  }
}

function handle_resize() {
  cancelAnimationFrame(animFrameId);
  lastTime = 0;
  init();
  animFrameId = requestAnimationFrame(animate);
}

onMount(() => {
  noise = new FastNoiseLite();
  noise.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
  noise.SetFrequency(0.02);
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
