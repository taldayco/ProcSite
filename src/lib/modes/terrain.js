import { FONT_SIZE, GAP, BRIGHTNESS_LEVELS } from '../constants.js';
import { sampleNoise } from '../noise.js';
import { cellBrightnessModifier } from '../effects.js';

const TERRAIN_CHARS = [' ', '░', '▒', '▓', '█'];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('fastnoise-lite').default} noise
 * @param {number} cols
 * @param {number} rows
 * @param {string[]} colorStrings
 * @param {string} fontFamily
 */
export function init(ctx, noise, cols, rows, colorStrings, fontFamily) {
  return {};
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
  // Terrain is purely noise-driven, no state to update
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
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  /** @type {number[][]} */
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const noiseVal = sampleNoise(noise, col, row, offset.x, offset.y);

      // Map noise to elevation band (terrain char index)
      const terrainIdx = Math.min(Math.floor(noiseVal * TERRAIN_CHARS.length), TERRAIN_CHARS.length - 1);
      if (terrainIdx === 0) continue; // space = empty

      // Map noise to brightness bucket
      const effectMod = cellBrightnessModifier(effectsState, col, row);
      const bucket = Math.min(Math.floor(noiseVal * BRIGHTNESS_LEVELS + effectMod), BRIGHTNESS_LEVELS - 1);
      if (bucket === 0) continue;

      buckets[bucket].push(col, row, terrainIdx);
    }
  }

  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  for (let b = 1; b < BRIGHTNESS_LEVELS; b++) {
    const arr = buckets[b];
    if (arr.length === 0) continue;
    ctx.fillStyle = colorStrings[b];
    for (let i = 0; i < arr.length; i += 3) {
      ctx.fillText(TERRAIN_CHARS[arr[i + 2]], arr[i] * cellW, arr[i + 1] * cellH);
    }
  }
}
