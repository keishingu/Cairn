// Node.js script to generate all PWA icon variants
// Usage: node scripts/generate-icons.mjs
// Requires: canvas package (pnpm add -w -D canvas)

import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../apps/web/public');
mkdirSync(publicDir, { recursive: true });

const ACCENT_PRESETS = [
  { id: 'emerald', swatch: '#10B981' },
  { id: 'blue',    swatch: '#3B82F6' },
  { id: 'violet',  swatch: '#8B5CF6' },
  { id: 'rose',    swatch: '#F43F5E' },
  { id: 'pink',    swatch: '#EC4899' },
  { id: 'amber',   swatch: '#F59E0B' },
  { id: 'cyan',    swatch: '#06B6D4' },
];

const THEMES = {
  dark:  { bg: '#0B1622', cornerRadius: 80 },
  light: { bg: '#FFFFFF', cornerRadius: 80 },
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function drawIcon(ctx, size, bgColor, blockColor, cornerRadius) {
  const s = size / 512;
  const cr = cornerRadius * s;

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, size, size, cr);
  ctx.fill();

  // Shadow under blocks for light theme (subtle depth)
  if (bgColor === '#FFFFFF') {
    const { r, g, b } = hexToRgb(blockColor);
    ctx.shadowColor = `rgba(${r},${g},${b},0.25)`;
    ctx.shadowBlur = 8 * s;
    ctx.shadowOffsetY = 3 * s;
  }

  ctx.fillStyle = blockColor;

  // Top block
  roundRect(ctx, 192 * s, 88 * s, 188 * s, 88 * s, 22 * s);
  ctx.fill();

  // Middle block
  roundRect(ctx, 96 * s, 204 * s, 228 * s, 88 * s, 22 * s);
  ctx.fill();

  // Bottom block
  roundRect(ctx, 112 * s, 320 * s, 296 * s, 92 * s, 22 * s);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
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

function generate(filename, size, bgColor, blockColor, cornerRadius = 80) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, size, bgColor, blockColor, cornerRadius);
  writeFileSync(join(publicDir, filename), canvas.toBuffer('image/png'));
  console.log(`  ${filename} (${size}x${size})`);
}

// Generate all variants: 7 colors × 2 themes × 3 sizes
for (const preset of ACCENT_PRESETS) {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    console.log(`\n${preset.id} / ${themeName}`);
    generate(`icon-${preset.id}-${themeName}-192.png`, 192, theme.bg, preset.swatch, theme.cornerRadius);
    generate(`icon-${preset.id}-${themeName}-512.png`, 512, theme.bg, preset.swatch, theme.cornerRadius);
    generate(`apple-touch-icon-${preset.id}-${themeName}.png`, 180, theme.bg, preset.swatch, theme.cornerRadius);
  }
}

// Also generate the generic fallback icons (used as default before cookie is set)
console.log('\nfallback icons');
generate('icon-192.png',        192, '#0B1622', '#10B981');
generate('icon-512.png',        512, '#0B1622', '#10B981');
generate('apple-touch-icon.png', 180, '#0B1622', '#10B981');

console.log('\nDone!');
