/** @type {AudioContext | null} */
let ctx = null;

/** Get or create the shared AudioContext, resuming if suspended. */
export function getCtx() {
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** Call from a user gesture to satisfy autoplay policy. */
export function ensureAudio() {
  getCtx();
}
