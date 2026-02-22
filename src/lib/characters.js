import { SHUFFLE_MIN, SHUFFLE_MAX } from './constants.js';

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
  for (let i = 0; i < total; i++) {
    charIndices[i] = Math.floor(Math.random() * CHARS.length);
    shuffleTimers[i] = Math.random() * 2.0;
  }
  return { charIndices, shuffleTimers };
}

/**
 * @param {Uint16Array} charIndices
 * @param {Float32Array} shuffleTimers
 * @param {number} idx
 * @param {number} dt
 */
export function updateShuffleTimers(charIndices, shuffleTimers, idx, dt) {
  shuffleTimers[idx] -= dt;
  if (shuffleTimers[idx] <= 0) {
    charIndices[idx] = Math.floor(Math.random() * CHARS.length);
    shuffleTimers[idx] = SHUFFLE_MIN + Math.random() * (SHUFFLE_MAX - SHUFFLE_MIN);
  }
}
