import { HEADER_FONT_SIZE, DECODE_DURATION, FADE_DURATION, BRIGHTNESS_LEVELS, WORDS } from './constants.js';
import { CHARS } from './characters.js';

/**
 * @typedef {{ word: string, x: number, y: number, startTime: number, fontSize: number, fadeStartTime: number | null }} Header
 */

/**
 * @param {Header[]} headers
 * @param {number} now
 * @returns {Header[]}
 */
export function pruneHeaders(headers, now) {
  return headers.filter(h => {
    if (h.fadeStartTime == null) return true;
    return (now - h.fadeStartTime) < FADE_DURATION;
  });
}

/**
 * @param {Header[]} headers
 * @param {number} now
 */
export function fadeAllHeaders(headers, now) {
  for (const h of headers) {
    if (h.fadeStartTime == null) {
      h.fadeStartTime = now;
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {string} fontFamily
 * @returns {Header}
 */
export function spawnHeader(ctx, canvasWidth, canvasHeight, fontFamily) {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  ctx.font = `${HEADER_FONT_SIZE}px ${fontFamily}`;
  const textWidth = ctx.measureText(word).width;
  const maxX = Math.max(0, canvasWidth - textWidth - 20);
  const maxY = Math.max(0, canvasHeight - HEADER_FONT_SIZE - 20);
  return {
    word,
    x: 20 + Math.random() * maxX,
    y: 20 + Math.random() * maxY,
    startTime: performance.now(),
    fontSize: HEADER_FONT_SIZE,
    fadeStartTime: null,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Header[]} headers
 * @param {string[]} colorStrings
 * @param {string} fontFamily
 * @param {number} now
 */
export function renderHeaders(ctx, headers, colorStrings, fontFamily, now) {
  for (const h of headers) {
    const elapsed = now - h.startTime;
    ctx.save();
    ctx.font = `${h.fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = colorStrings[BRIGHTNESS_LEVELS - 1];

    if (h.fadeStartTime != null) {
      const fadeElapsed = now - h.fadeStartTime;
      ctx.globalAlpha = 1 - fadeElapsed / FADE_DURATION;
    }

    let text = '';
    for (let i = 0; i < h.word.length; i++) {
      const resolveAt = (i / h.word.length) * DECODE_DURATION;
      if (elapsed >= resolveAt) {
        text += h.word[i];
      } else {
        const scrambleIdx = Math.floor(now / 50 + i * 7) % CHARS.length;
        text += CHARS[scrambleIdx];
      }
    }

    ctx.fillText(text, h.x, h.y);
    ctx.restore();
  }
}
