<script>
import { onMount } from "svelte";
import FastNoiseLite from "fastnoise-lite";

let canvas;

const SPEED = 30;
const SCALE = 2;

let ctx, imageData, data, noise;
let offsetX = 0, offsetY = 0;
let angle = Math.random() * 2 * Math.PI;
let dx = Math.cos(angle), dy = Math.sin(angle);
let lastTime = 0, animFrameId;
let lastDirectionChange = 0;

function init() {
  canvas.width = Math.floor(window.innerWidth / SCALE);
  canvas.height = Math.floor(window.innerHeight / SCALE);
  ctx = canvas.getContext('2d');
  imageData = ctx.createImageData(canvas.width, canvas.height);
  data = imageData.data;
}

function animate_noise(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  offsetX += dx * SPEED * dt;
  offsetY += dy * SPEED * dt;

  const w = canvas.width;
  const h = canvas.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const noise_value = (noise.GetNoise(x + offsetX, y + offsetY) + 1) / 2;
      const brightness = Math.floor(noise_value * 255);
      const i = (y * w + x) * 4;
      data[i] = brightness;
      data[i + 1] = brightness;
      data[i + 2] = brightness;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  animFrameId = requestAnimationFrame(animate_noise);
}

const distanceFunctions = Object.values(FastNoiseLite.CellularDistanceFunction);
const returnTypes = Object.values(FastNoiseLite.CellularReturnType);

function randomize_direction() {
  const now = performance.now();
  if (now - lastDirectionChange < 300) return;
  lastDirectionChange = now;
  angle = Math.random() * 2 * Math.PI;
  dx = Math.cos(angle);
  dy = Math.sin(angle);
  noise.SetCellularDistanceFunction(distanceFunctions[Math.floor(Math.random() * distanceFunctions.length)]);
  noise.SetCellularReturnType(returnTypes[Math.floor(Math.random() * returnTypes.length)]);
  noise.SetCellularJitter(0.2 + Math.random() * 1.3);
}

function handle_resize() {
  cancelAnimationFrame(animFrameId);
  lastTime = 0;
  init();
  animFrameId = requestAnimationFrame(animate_noise);
}

onMount(() => {
  noise = new FastNoiseLite();
  noise.SetNoiseType(FastNoiseLite.NoiseType.Cellular);
  noise.SetFrequency(0.02);
  init();
  animFrameId = requestAnimationFrame(animate_noise);
  return () => cancelAnimationFrame(animFrameId);
});
</script>

<svelte:window onresize={handle_resize} onkeydown={randomize_direction} onscroll={randomize_direction} />
<canvas
  bind:this={canvas}
  onclick={randomize_direction}
  ontouchstart={randomize_direction}
  ontouchmove={randomize_direction}
  onwheel={randomize_direction}
></canvas>

<style>
:global(body) {
  margin: 0;
  overflow: hidden;
}
canvas {
  display: block;
  width: 100vw;
  height: 100vh;
  image-rendering: auto;
}
</style>
