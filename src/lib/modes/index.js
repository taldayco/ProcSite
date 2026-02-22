import * as grid from './grid.js';
import * as fractal from './fractal.js';
import * as particles from './particles.js';
import * as terrain from './terrain.js';
import * as multilayer from './multilayer.js';

/** @type {{ name: string, init: Function, update: Function, render: Function }[]} */
export const MODES = [
  { name: 'grid', ...grid },
  { name: 'fractal', ...fractal },
  { name: 'particles', ...particles },
  { name: 'terrain', ...terrain },
  { name: 'multilayer', ...multilayer },
];

/** Pick a random mode (different from current if possible) */
export function randomMode(currentName = '') {
  if (MODES.length <= 1) return MODES[0];
  let mode;
  do {
    mode = MODES[Math.floor(Math.random() * MODES.length)];
  } while (mode.name === currentName);
  return mode;
}
