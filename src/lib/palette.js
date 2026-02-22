import { BRIGHTNESS_LEVELS, PALETTES, FONTS } from './constants.js';

/** @param {number[]} baseColor */
export function buildColorStrings(baseColor) {
  /** @type {string[]} */
  const strings = [];
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) {
    const b = 0.15 + ((i + 0.5) / BRIGHTNESS_LEVELS) * 0.40;
    strings.push(
      `rgb(${Math.floor(baseColor[0] * b)},${Math.floor(baseColor[1] * b)},${Math.floor(baseColor[2] * b)})`
    );
  }
  return strings;
}

/** @returns {number[]} */
export function randomPalette() {
  return PALETTES[Math.floor(Math.random() * PALETTES.length)];
}

/** @returns {string} */
export function randomFont() {
  return FONTS[Math.floor(Math.random() * FONTS.length)];
}

/** @param {number[]} fromColor @param {number[]} toColor @param {number} duration */
export function createColorMorph(fromColor, toColor, duration) {
  return { from: fromColor, to: toColor, progress: 0, duration };
}

/** @param {object} morph @param {number} dt @returns {boolean} done */
export function updateColorMorph(morph, dt) {
  morph.progress = Math.min(morph.progress + dt / morph.duration, 1);
  return morph.progress >= 1;
}

/** @param {object} morph @returns {string[]} */
export function buildMorphedColorStrings(morph) {
  const t = morph.progress;
  const s = t * t * (3 - 2 * t); // smoothstep
  const color = [
    Math.round(morph.from[0] + (morph.to[0] - morph.from[0]) * s),
    Math.round(morph.from[1] + (morph.to[1] - morph.from[1]) * s),
    Math.round(morph.from[2] + (morph.to[2] - morph.from[2]) * s),
  ];
  return buildColorStrings(color);
}
