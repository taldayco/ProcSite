import { FONT_SIZE, GAP, BRIGHTNESS_LEVELS, NOISE_SCALE } from '../constants.js';
import { CHARS } from '../characters.js';
import { createNoise, sampleNoise } from '../noise.js';
import { cellBrightnessModifier } from '../effects.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('fastnoise-lite').default} noise
 * @param {number} cols
 * @param {number} rows
 * @param {string[]} colorStrings
 * @param {string} fontFamily
 */
export function init(ctx, noise, cols, rows, colorStrings, fontFamily) {
  const frequencies = [0.01, 0.05, 0.1];
  const weights = [0.5, 0.3, 0.2];
  const layers = frequencies.map(f => createNoise(f));
  return { layers, weights };
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
  // No per-frame state updates
}

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
export function render(ctx, state, noise, cols, rows, offset, colorStrings, fontFamily, dt, effectsState) {
  const { layers, weights } = state;
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  /** @type {number[][]} */
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Primary noise layer
      let blended = sampleNoise(noise, col, row, offset.x, offset.y) * 0.4;

      // Additional layers with different frequencies
      for (let l = 0; l < layers.length; l++) {
        blended += sampleNoise(layers[l], col, row, offset.x, offset.y) * weights[l];
      }

      // Clamp to [0, 1]
      blended = Math.min(Math.max(blended, 0), 1);

      const effectMod = cellBrightnessModifier(effectsState, col, row);
      const bucket = Math.min(Math.floor(blended * BRIGHTNESS_LEVELS + effectMod), BRIGHTNESS_LEVELS - 1);
      if (bucket === 0) continue;

      const charIdx = Math.floor(blended * CHARS.length) % CHARS.length;
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
