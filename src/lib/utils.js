import { randomMode } from "$lib/modes/index.js";
import { randomizeNoise } from "$lib/noise.js";
import { randomPalette, randomFont, createColorMorph } from "$lib/palette.js";
import { measureGrid, sizeCanvas } from "$lib/renderer.js";
import { fadeAllHeaders, spawnHeader } from "$lib/headers.js";
import { COLOR_MORPH_DURATION } from "$lib/constants.js";

/**
 * Randomizes the movement direction and orchestrates various visual effects
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {import('fastnoise-lite').default} noise FastNoiseLite instance
 * @param {ReturnType<typeof createEffectsState>} effectsState Effects state
 * @param {number[]} baseColor Current base color
 * @param {string} fontFamily Current font family
 * @param {string[]} colorStrings Current color strings
 * @param {number} cols Current columns
 * @param {number} rows Current rows
 * @param {number} charWidth Current character width
 * @param {number} cellW Current cell width
 * @param {number} cellH Current cell height
 * @param {{ name: string, init: Function, update: Function, render: Function }} currentMode Current mode
 * @param {any} modeState Current mode state
 * @param {ReturnType<typeof pruneHeaders>} activeHeaders Active headers
 * @param {number} lastDirectionChange Last direction change timestamp
 * @returns {object} Updated state values
 */
export function randomizeDirection(
  ctx,
  noise,
  effectsState,
  baseColor,
  fontFamily,
  colorStrings,
  cols,
  rows,
  charWidth,
  cellW,
  cellH,
  currentMode,
  modeState,
  activeHeaders,
  lastDirectionChange
) {
  const now = performance.now();
  if (now - lastDirectionChange < 300) return { lastDirectionChange };
  lastDirectionChange = now;

  const angle = Math.random() * 2 * Math.PI;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  randomizeNoise(noise);

  // Smooth color morph instead of instant switch
  const colorMorph = createColorMorph(baseColor, randomPalette(), COLOR_MORPH_DURATION);
  const newFontFamily = randomFont();

  const grid = measureGrid(ctx, newFontFamily);
  const newCols = grid.cols;
  const newRows = grid.rows;
  const newCharWidth = grid.charWidth;
  const newCellW = grid.cellW;
  const newCellH = grid.cellH;
  sizeCanvas(ctx.canvas, newCols, grid.cellW, newRows, grid.cellH);
  ctx.font = `${FONT_SIZE}px ${newFontFamily}`;
  ctx.textBaseline = 'top';

  // Switch to a new random mode
  const newMode = randomMode(currentMode.name);
  const newModeState = newMode.init(ctx, noise, newCols, newRows, colorStrings, newFontFamily);

  const newActiveHeaders = [...activeHeaders];
  fadeAllHeaders(newActiveHeaders, now);
  newActiveHeaders.push(spawnHeader(ctx, ctx.canvas.width, ctx.canvas.height, newFontFamily));

  return {
    angle,
    dx,
    dy,
    lastDirectionChange,
    noise,
    colorMorph,
    fontFamily: newFontFamily,
    cols: newCols,
    rows: newRows,
    charWidth: newCharWidth,
    cellW: newCellW,
    cellH: newCellH,
    currentMode: newMode,
    modeState: newModeState,
    activeHeaders: newActiveHeaders
  };
}