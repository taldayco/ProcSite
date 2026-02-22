import { SHUFFLE_MIN, SHUFFLE_MAX, AGE_BRIGHTNESS_BOOST, AGE_MATURITY, BRIGHTNESS_LEVELS } from './constants.js';

export const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
  '∀∂∃∅∇∈∉∋∏∑−∗√∝∞∠∧∨∩∪∫≈≠≡≤≥⊂⊃⊆⊇⊕⊗' +
  '│┃┄┅┆┇┈┉─━┌┐└┘├┤┬┴┼╋' +
  '←↑→↓↔↕↖↗↘↙⇐⇒⇑⇓' +
  '■□▪▫▬▲△▶▷▼▽◀◁◆◇○●◎◐◑' +
  '⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏' +
  '₿Ξ¥€£¢₹';

/** @param {number} total */
export function createCharArrays(total) {
  const charIndices = new Uint16Array(total);
  const shuffleTimers = new Float32Array(total);
  const charAges = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    charIndices[i] = Math.floor(Math.random() * CHARS.length);
    shuffleTimers[i] = Math.random() * 2.0;
  }
  return { charIndices, shuffleTimers, charAges };
}

/**
 * @param {Uint16Array} charIndices
 * @param {Float32Array} shuffleTimers
 * @param {Float32Array} charAges
 * @param {number} idx
 * @param {number} dt
 */
export function updateShuffleTimers(charIndices, shuffleTimers, charAges, idx, dt) {
  charAges[idx] += dt;
  shuffleTimers[idx] -= dt;
  if (shuffleTimers[idx] <= 0) {
    charIndices[idx] = Math.floor(Math.random() * CHARS.length);
    shuffleTimers[idx] = SHUFFLE_MIN + Math.random() * (SHUFFLE_MAX - SHUFFLE_MIN);
    charAges[idx] = 0;
  }
}

/** @param {Float32Array} charAges @param {number} idx @returns {number} */
export function ageBrightnessBoost(charAges, idx) {
  return Math.min(charAges[idx] / AGE_MATURITY, 1) * AGE_BRIGHTNESS_BOOST * BRIGHTNESS_LEVELS;
}
