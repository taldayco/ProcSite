import { FONT_SIZE, GAP } from './constants.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} fontFamily
 */
export function measureGrid(ctx, fontFamily) {
  ctx.font = `${FONT_SIZE}px ${fontFamily}`;
  const charWidth = ctx.measureText('W').width;
  const cellW = charWidth + GAP;
  const cellH = FONT_SIZE + GAP;
  const cols = Math.floor(window.innerWidth / cellW);
  const rows = Math.floor(window.innerHeight / cellH);
  return { cols, rows, charWidth, cellW, cellH };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} cols
 * @param {number} cellW
 * @param {number} rows
 * @param {number} cellH
 */
export function sizeCanvas(canvas, cols, cellW, rows, cellH) {
  canvas.width = Math.ceil(cols * cellW);
  canvas.height = rows * cellH;
}
