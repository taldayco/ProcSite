import { FONT_SIZE, GAP, BRIGHTNESS_LEVELS } from '../constants.js';
import { CHARS, createCharArrays, updateShuffleTimers, ageBrightnessBoost } from '../characters.js';
import { sampleNoise } from '../noise.js';
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
  const arrays = createCharArrays(cols * rows);
  return {
    charIndices: arrays.charIndices,
    shuffleTimers: arrays.shuffleTimers,
    charAges: arrays.charAges,
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
  // Shuffle timers are updated during render for efficiency (bucket sort pass)
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
  const { charIndices, shuffleTimers, charAges } = state;
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  /** @type {number[][]} */
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;

      updateShuffleTimers(charIndices, shuffleTimers, charAges, idx, dt);

      const noiseVal = sampleNoise(noise, col, row, offset.x, offset.y);
      const ageBoost = ageBrightnessBoost(charAges, idx);
      const effectMod = cellBrightnessModifier(effectsState, col, row);
      const bucket = Math.min(Math.floor(noiseVal * BRIGHTNESS_LEVELS + ageBoost + effectMod), BRIGHTNESS_LEVELS - 1);

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
