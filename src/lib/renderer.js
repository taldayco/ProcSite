import { FONT_SIZE, GAP, BRIGHTNESS_LEVELS } from './constants.js';
import { CHARS, updateShuffleTimers } from './characters.js';
import { sampleNoise } from './noise.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} fontFamily
 */
export function measureGrid(ctx, fontFamily) {
  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;
  const cols = Math.floor(window.innerWidth / cellW);
  const rows = Math.floor(window.innerHeight / cellH);
  return { cols, rows, charWidth, cellW, cellH };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} cols
 * @param {number} cellW
 * @param {number} rows
 * @param {number} cellH
 */
export function sizeCanvas(canvas, cols, cellW, rows, cellH) {
  canvas.width = Math.ceil(cols * cellW);
  canvas.height = rows * cellH;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('fastnoise-lite').default} noise
 * @param {{ cols: number, rows: number, charWidth: number, charIndices: Uint16Array, shuffleTimers: Float32Array }} grid
 * @param {{ x: number, y: number }} offset
 * @param {string[]} colorStrings
 * @param {string} fontFamily
 * @param {number} dt
 */
export function renderGrid(ctx, noise, grid, offset, colorStrings, fontFamily, dt) {
  const { cols, rows, charWidth, charIndices, shuffleTimers } = grid;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  /** @type {number[][]} */
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;

      updateShuffleTimers(charIndices, shuffleTimers, idx, dt);

      const noiseVal = sampleNoise(noise, col, row, offset.x, offset.y);
      const bucket = Math.min(Math.floor(noiseVal * BRIGHTNESS_LEVELS), BRIGHTNESS_LEVELS - 1);

      if (bucket === 0) continue;

      buckets[bucket].push(col, row, charIndices[idx]);
    }
  }

  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  for (let b = 1; b < BRIGHTNESS_LEVELS; b++) {
    const arr = buckets[b];
    if (arr.length === 0) continue;
    ctx.fillStyle = colorStrings[b];
    for (let i = 0; i < arr.length; i += 3) {
      ctx.fillText(CHARS[arr[i + 2]], arr[i] * cellW, arr[i + 1] * cellH);
    }
  }
}
