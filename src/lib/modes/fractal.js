import { FONT_SIZE, GAP, BRIGHTNESS_LEVELS } from '../constants.js';
import { CHARS } from '../characters.js';
import { sampleNoise } from '../noise.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('fastnoise-lite').default} noise
 * @param {number} cols
 * @param {number} rows
 * @param {string[]} colorStrings
 * @param {string} fontFamily
 */
export function init(ctx, noise, cols, rows, colorStrings, fontFamily) {
  // Pick a random Julia constant c (small complex number)
  const angle = Math.random() * 2 * Math.PI;
  const r = 0.3 + Math.random() * 0.5;
  return {
    cReal: r * Math.cos(angle),
    cImag: r * Math.sin(angle),
    zoom: 2.5 + Math.random() * 1.5,
    centerX: (Math.random() - 0.5) * 0.5,
    centerY: (Math.random() - 0.5) * 0.5,
  };
}

/**
 * @param {object} state
 * @param {number} dt
 * @param {{ x: number, y: number }} offset
 * @param {import('fastnoise-lite').default} noise
 * @param {number} cols
 * @param {number} rows
 */
export function update(state, dt, offset, noise, cols, rows) {
  // Static fractal — no per-frame state updates needed
}

const MAX_ITER = 20;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import('fastnoise-lite').default} noise
 * @param {number} cols
 * @param {number} rows
 * @param {{ x: number, y: number }} offset
 * @param {string[]} colorStrings
 * @param {string} fontFamily
 * @param {number} dt
 */
export function render(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt) {
  const { cReal, cImag, zoom, centerX, centerY } = state;
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  // Slow drift from noise offset
  const driftX = offset.x * 0.002;
  const driftY = offset.y * 0.002;

  /** @type {number[][]} */
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Map cell to complex plane
      let zr = ((col / cols) - 0.5) * zoom + centerX + driftX;
      let zi = ((row / rows) - 0.5) * zoom * (rows / cols) + centerY + driftY;

      // Julia iteration
      let iter = 0;
      for (; iter < MAX_ITER; iter++) {
        const zr2 = zr * zr;
        const zi2 = zi * zi;
        if (zr2 + zi2 > 4) break;
        const newZr = zr2 - zi2 + cReal;
        zi = 2 * zr * zi + cImag;
        zr = newZr;
      }

      // Blend fractal value with noise
      const fractalVal = iter / MAX_ITER;
      const noiseVal = sampleNoise(noise, col, row, offset.x, offset.y);
      const blended = fractalVal * 0.6 + noiseVal * 0.4;

      const bucket = Math.min(Math.floor(blended * BRIGHTNESS_LEVELS), BRIGHTNESS_LEVELS - 1);
      if (bucket === 0) continue;

      const charIdx = Math.floor((fractalVal + noiseVal) * CHARS.length) % CHARS.length;
      buckets[bucket].push(col, row, charIdx);
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
