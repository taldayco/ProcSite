import { FONT_SIZE, GAP, BRIGHTNESS_LEVELS } from '../constants.js';
import { CHARS } from '../characters.js';
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
  const count = Math.max(50, Math.floor(cols * rows * 0.05));
  const particles = new Array(count);
  for (let i = 0; i < count; i++) {
    particles[i] = spawnParticle(cols, rows);
  }
  return { particles, count };
}

function spawnParticle(cols, rows) {
  return {
    x: Math.random() * cols,
    y: Math.random() * rows,
    age: 0,
    lifetime: 2 + Math.random() * 4,
    charIdx: Math.floor(Math.random() * CHARS.length),
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
  const { particles } = state;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.age += dt;

    if (p.age >= p.lifetime || p.x < -1 || p.x > cols + 1 || p.y < -1 || p.y > rows + 1) {
      particles[i] = spawnParticle(cols, rows);
      continue;
    }

    // Use noise gradient to steer particle
    const n = sampleNoise(noise, p.x, p.y, offset.x, offset.y);
    const angle = n * Math.PI * 4;
    const speed = 3 + n * 5;
    p.x += Math.cos(angle) * speed * dt;
    p.y += Math.sin(angle) * speed * dt;

    // Slowly cycle character
    if (Math.random() < dt * 2) {
      p.charIdx = Math.floor(Math.random() * CHARS.length);
    }
  }
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
  const { particles } = state;
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;

  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  /** @type {number[][]} */
  const buckets = new Array(BRIGHTNESS_LEVELS);
  for (let i = 0; i < BRIGHTNESS_LEVELS; i++) buckets[i] = [];

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const lifeRatio = p.age / p.lifetime;

    // Fade in quickly, fade out slowly
    let alpha;
    if (lifeRatio < 0.1) {
      alpha = lifeRatio / 0.1;
    } else {
      alpha = 1 - ((lifeRatio - 0.1) / 0.9);
    }

    const noiseVal = sampleNoise(noise, p.x, p.y, offset.x, offset.y);
    const brightness = alpha * (0.3 + noiseVal * 0.7);
    const effectMod = cellBrightnessModifier(effectsState, p.x, p.y);
    const bucket = Math.min(Math.floor(brightness * BRIGHTNESS_LEVELS + effectMod), BRIGHTNESS_LEVELS - 1);
    if (bucket <= 0) continue;

    const drawX = p.x * cellW;
    const drawY = p.y * cellH;
    buckets[bucket].push(drawX, drawY, p.charIdx);
  }

  for (let b = 1; b < BRIGHTNESS_LEVELS; b++) {
    const arr = buckets[b];
    if (arr.length === 0) continue;
    ctx.fillStyle = colorStrings[b];
    for (let i = 0; i < arr.length; i += 3) {
      ctx.fillText(CHARS[arr[i + 2]], arr[i], arr[i + 1]);
    }
  }
}
