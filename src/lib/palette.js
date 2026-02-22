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
