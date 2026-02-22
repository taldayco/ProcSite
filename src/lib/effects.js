export function createEffectsState() {
  return {
    cursorCol: 0,
    cursorRow: 0,
    cursorActive: false,
    ripples: [],
    glowRadius: 8,
    glowStrength: 0.4,
    rippleSpeed: 25,
    rippleMaxRadius: 30,
    rippleDuration: 1.2,
  };
}

/** @param {object} state @param {number} clientX @param {number} clientY @param {number} cellW @param {number} cellH */
export function updateCursor(state, clientX, clientY, cellW, cellH) {
  state.cursorCol = clientX / cellW;
  state.cursorRow = clientY / cellH;
  state.cursorActive = true;
}

/** @param {object} state */
export function clearCursor(state) {
  state.cursorActive = false;
}

/** @param {object} state @param {number} col @param {number} row */
export function spawnRipple(state, col, row) {
  state.ripples.push({ col, row, radius: 0, age: 0 });
  if (state.ripples.length > 10) state.ripples.shift();
}

/** @param {object} state @param {number} dt */
export function updateEffects(state, dt) {
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const r = state.ripples[i];
    r.age += dt;
    r.radius += state.rippleSpeed * dt;
    if (r.age >= state.rippleDuration) {
      state.ripples.splice(i, 1);
    }
  }
}

/** @param {object} state @param {number} col @param {number} row @returns {number} */
export function cellBrightnessModifier(state, col, row) {
  let mod = 0;

  // Cursor glow
  if (state.cursorActive) {
    const dcol = col - state.cursorCol;
    const drow = row - state.cursorRow;
    const dist2 = dcol * dcol + drow * drow;
    const r2 = state.glowRadius * state.glowRadius;
    if (dist2 < r2) {
      const falloff = 1 - dist2 / r2;
      mod += falloff * falloff * state.glowStrength * 16;
    }
  }

  // Ripples
  for (let i = 0; i < state.ripples.length; i++) {
    const rip = state.ripples[i];
    const dcol = col - rip.col;
    const drow = row - rip.row;
    const dist = Math.sqrt(dcol * dcol + drow * drow);
    const ringDist = Math.abs(dist - rip.radius);
    if (ringDist < 2.5) {
      const fade = 1 - rip.age / state.rippleDuration;
      const ringStrength = 1 - ringDist / 2.5;
      mod += ringStrength * fade * 0.4 * 16;
    }
  }

  return mod;
}
