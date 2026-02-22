import { FONT_SIZE, COLOR_MORPH_DURATION } from "$lib/constants.js";
import { randomPalette, randomFont, createColorMorph } from "$lib/palette.js";
import { randomizeNoise } from "$lib/noise.js";
import { measureGrid, sizeCanvas } from "$lib/renderer.js";
import { fadeAllHeaders, spawnHeader } from "$lib/headers.js";
import { randomMode } from "$lib/modes/index.js";

/**
 * Randomizes direction, noise, color, font, grid, mode, and headers.
 * Mutates the state object in place and returns it.
 * @param {object} state
 */
export function randomize(state) {
  const now = performance.now();
  if (now - state.lastDirectionChange < 300) return state;
  state.lastDirectionChange = now;

  state.angle = Math.random() * 2 * Math.PI;
  state.dx = Math.cos(state.angle);
  state.dy = Math.sin(state.angle);

  randomizeNoise(state.noise);

  state.colorMorph = createColorMorph(state.baseColor, randomPalette(), COLOR_MORPH_DURATION);
  state.fontFamily = randomFont();

  const grid = measureGrid(state.ctx, state.fontFamily);
  state.cols = grid.cols;
  state.rows = grid.rows;
  state.charWidth = grid.charWidth;
  state.cellW = grid.cellW;
  state.cellH = grid.cellH;
  sizeCanvas(state.canvas, state.cols, grid.cellW, state.rows, grid.cellH);
  state.ctx.font = `${FONT_SIZE}px ${state.fontFamily}`;
  state.ctx.textBaseline = 'top';

  state.currentMode = randomMode(state.currentMode.name);
  state.modeState = state.currentMode.init(state.ctx, state.noise, state.cols, state.rows, state.colorStrings, state.fontFamily);

  fadeAllHeaders(state.activeHeaders, now);
  state.activeHeaders.push(spawnHeader(state.ctx, state.canvas.width, state.canvas.height, state.fontFamily));

  return state;
}
