import { getCtx } from "./context.js";

/**
 * 40ms filtered white-noise burst with random bandpass (4-6kHz).
 * Slight frequency jitter makes repeated keys sound organic.
 */
export function playKeystroke() {
  const ctx = getCtx();
  const duration = 0.04;
  const now = ctx.currentTime;

  // White noise buffer
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2500 + Math.random() * 1500;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  const baseVol = 0.04;
  const jitter = 0.7 + Math.random() * 0.6; // 0.7x to 1.3x multiplier
  gain.gain.setValueAtTime(baseVol * jitter, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + duration);
}

/** Short square-wave burst + pitch jump for a sharp digital Enter sound. */
export function playSubmit() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1760, now + 0.02);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.setValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

/** Short soft sine sweep for blink sound. */
export function playBlink() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const duration = 0.05;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

/** Sine sweep 800->300Hz over 60ms (reverse of submit). */
export function playBackspace() {
  const ctx = getCtx();
  const duration = 0.06;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}
