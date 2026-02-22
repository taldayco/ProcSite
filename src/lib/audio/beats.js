import { getCtx } from "./context.js";
import { REGISTERED_FUNCTIONS, WINDOW_FUNCTIONS } from "./prebake.js";

let strudel = null;
let repl = null;
let initPromise = null;

const LAYERS = {
  // Deep warm kick: gentle FM, sub-bass weight, longer decay
  kick: `note("c1 c1 c1 c1").dx(3, 0.8, 1).gain(0.28).dec(.25).lpf(200)`,
  // Tamed acid bass: lower resonance, gentler envelope, breathing room
  bass: `note("c2 [~ c2] bb1 [~ ab1]").softacid().acidenv(0.25).gain(0.22).slow(2)`,
  // Warm Cm7 pad chord with shimmer
  synth: `note("[c3,eb3,g3,bb3]").pad().shimmer(0.5).rlpf(0.35).gain(0.12).slow(4)`,
};

const LAYER_ORDER = ["kick", "bass", "synth"];

let timeFloor = 0;
let detectionExtra = 0;
let cpm = 70;
let lastEvalFingerprint = "";

function getLayerCount() {
  return Math.min(timeFloor + detectionExtra, LAYER_ORDER.length);
}

function getActiveLayers() {
  return LAYER_ORDER.slice(0, getLayerCount());
}

function buildPattern() {
  const layers = getActiveLayers();
  if (layers.length === 0) return null;
  const stacks = layers.map((n) => LAYERS[n]).join(",\n    ");
  return `stack(\n    ${stacks}\n  ).cpm(${cpm})`;
}

async function evaluatePattern() {
  if (!repl) return;
  const pattern = buildPattern();
  if (!pattern) {
    try {
      repl.stop();
    } catch (_) {}
    lastEvalFingerprint = "";
    return;
  }
  if (pattern === lastEvalFingerprint) return;
  lastEvalFingerprint = pattern;
  try {
    await repl.evaluate(pattern);
  } catch (e) {
    console.warn("Failed to evaluate pattern:", e);
  }
}

/** Load Strudel + samples only, no sound yet. Returns a promise. */
export async function initBeats() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    strudel = await import("@strudel/web");
    repl = await strudel.initStrudel();
    // Explicitly init audio (don't rely on mousedown listener timing)
    await strudel.initAudio();
    try {
      await repl.evaluate(REGISTERED_FUNCTIONS);
    } catch (e) {
      console.error('Failed to register functions:', e);
    }
    try {
      await repl.evaluate(WINDOW_FUNCTIONS);
    } catch (e) {
      console.error('Failed to register window functions:', e);
    }
  })();
  return initPromise;
}

/** Add a named layer by raising timeFloor to include it. */
export async function addLayer(name) {
  if (initPromise) await initPromise;
  if (!repl || !LAYERS[name]) return;
  const idx = LAYER_ORDER.indexOf(name);
  if (idx < 0) return;
  const needed = idx + 1;
  if (needed <= timeFloor) return; // already included
  timeFloor = needed;
  cpm = 70 + (getLayerCount() - 1) * 5;
  await evaluatePattern();
}

/** Add layers above timeFloor based on detection (0–1). Never removes time-scheduled layers. */
export async function updateBeatsForDetection(detection) {
  const detectionLayers = Math.min(
    1 + Math.floor(detection / 0.2),
    LAYER_ORDER.length,
  );
  // Only add layers above timeFloor; never reduce below it
  const extra = Math.max(detectionLayers - timeFloor, 0);
  if (extra === detectionExtra) return;
  detectionExtra = extra;
  const layerCount = getLayerCount();
  const detectionTier = Math.floor(detection / 0.25);
  cpm = 70 + (layerCount - 1) * 5 + detectionTier * 10;
  await evaluatePattern();
}

/** Pitch-down + volume fade SFX (400ms), stops Strudel, returns a promise. */
export function transitionDown() {
  if (repl) {
    try {
      repl.stop();
    } catch (_) {}
  }
  timeFloor = 0;
  detectionExtra = 0;
  cpm = 70;
  lastEvalFingerprint = "";

  const ctx = getCtx();
  const now = ctx.currentTime;
  const duration = 0.4;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(50, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);

  return new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

/** Clear layers and restart with kick only. */
export async function resetToKick() {
  timeFloor = 1;
  detectionExtra = 0;
  cpm = 70;
  lastEvalFingerprint = "";
  await evaluatePattern();
}

/** Abrupt stop + crushed crash sound on kill. */
export function crashBeats() {
  if (repl) {
    try {
      repl.stop();
    } catch (_) {}
  }
  timeFloor = 0;
  detectionExtra = 0;
  lastEvalFingerprint = "";

  const ctx = getCtx();
  const duration = 0.5;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;

  const buf = ctx.createBuffer(1, sr * duration, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 128 - 1;
    curve[i] = Math.round(x * 4) / 4;
  }
  shaper.curve = curve;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  src.connect(shaper).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + duration);
}

/** Distorted synth that pitches down over the DEATH decode duration (1.5s). */
export function playDeathSynth() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const duration = 1.5;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + duration);

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 128 - 1;
    curve[i] = Math.round(x * 4) / 4;
  }
  shaper.curve = curve;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.frequency.exponentialRampToValueAtTime(80, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(shaper).connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

/** Clean stop on win/game-over. */
export function stopBeats() {
  if (repl) {
    try {
      repl.stop();
    } catch (_) {}
  }
  timeFloor = 0;
  detectionExtra = 0;
  cpm = 70;
  lastEvalFingerprint = "";
}
