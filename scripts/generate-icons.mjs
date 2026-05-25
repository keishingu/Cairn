// Node.js script to generate PNG icons from icon.svg
// Run: node scripts/generate-icons.mjs
// Requires: npm install -g canvas  OR  pnpm add -D canvas (in root)

import { createCanvas } from 'canvas';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../apps/web/public');

mkdirSync(publicDir, { recursive: true });

// Draw the Cairn logo onto a canvas
function drawIcon(ctx, size) {
  const s = size / 512;

  // Background
  ctx.fillStyle = '#0B1622';
  roundRect(ctx, 0, 0, size, size, 80 * s);
  ctx.fill();

  // Three rounded rectangles
  ctx.fillStyle = '#1AC47D';
  // Top
  roundRect(ctx, 192 * s, 88 * s, 188 * s, 88 * s, 22 * s);
  ctx.fill();
  // Middle
  roundRect(ctx, 96 * s, 204 * s, 228 * s, 88 * s, 22 * s);
  ctx.fill();
  // Bottom
  roundRect(ctx, 112 * s, 320 * s, 296 * s, 92 * s, 22 * s);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, size);
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(join(publicDir, name), buffer);
  console.log(`Generated: public/${name} (${size}x${size})`);
}
