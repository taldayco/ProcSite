import FastNoiseLite from 'fastnoise-lite';
import { NOISE_SCALE } from './constants.js';

const noiseTypes = Object.values(FastNoiseLite.NoiseType);
const distanceFunctions = Object.values(FastNoiseLite.CellularDistanceFunction);
const returnTypes = Object.values(FastNoiseLite.CellularReturnType);

/** @param {number} [frequency] */
export function createNoise(frequency = 0.02) {
  const noise = new FastNoiseLite();
  noise.SetNoiseType(/** @type {any} */ (FastNoiseLite.NoiseType.Cellular));
  noise.SetFrequency(frequency);
  return noise;
}

/** @param {FastNoiseLite} noise */
export function randomizeNoise(noise) {
  const noiseType = noiseTypes[Math.floor(Math.random() * noiseTypes.length)];
  noise.SetNoiseType(/** @type {any} */ (noiseType));
  if (noiseType === 'Cellular') {
    noise.SetCellularDistanceFunction(
      /** @type {any} */ (distanceFunctions[Math.floor(Math.random() * distanceFunctions.length)])
    );
    noise.SetCellularReturnType(
      /** @type {any} */ (returnTypes[Math.floor(Math.random() * returnTypes.length)])
    );
    noise.SetCellularJitter(0.2 + Math.random() * 1.3);
  }
}

/**
 * @param {FastNoiseLite} noise
 * @param {number} col
 * @param {number} row
 * @param {number} offsetX
 * @param {number} offsetY
 * @returns {number}
 */
export function sampleNoise(noise, col, row, offsetX, offsetY) {
  return (noise.GetNoise(col * NOISE_SCALE + offsetX, row * NOISE_SCALE + offsetY) + 1) / 2;
}
