#!/usr/bin/env node
// タイムライン HTML を 1 フレームずつ撮影し、H.264 MP4 にエンコードする。
// モーションは CSS アニメーション / WAAPI / window.seek(tMs) で記述されている前提
// （requestAnimationFrame 駆動は不可。詳細は references/rendering.md）。
//
// 使い方:
//   node render_video.mjs <timeline.html> --duration <秒> [--fps 30] [--out out.mp4] [--audio bgm.m4a]
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, globSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = { fps: 30, out: 'out.mp4', width: 1080, height: 1920 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else positional.push(a);
  }
  args.html = positional[0];
  if (!args.html || !args.duration) {
    console.error('使い方: node render_video.mjs <timeline.html> --duration <秒> [--fps 30] [--out out.mp4] [--audio bgm.m4a]');
    process.exit(1);
  }
  args.fps = Number(args.fps);
  args.duration = Number(args.duration);
  args.width = Number(args.width);
  args.height = Number(args.height);
  return args;
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    const hits = globSync(path.join(root, 'chromium-*/chrome-linux/chrome')).sort();
    if (hits.length) return hits[hits.length - 1];
  }
  return undefined; // playwright-core の既定解決に任せる
}

function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim();
  const viaPy = spawnSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' });
  if (viaPy.status === 0 && viaPy.stdout.trim()) return viaPy.stdout.trim();
  console.error('エラー: ffmpeg が見つかりません。\'pip3 install imageio-ffmpeg\' を実行するか FFMPEG_PATH を設定してください。');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const htmlPath = path.resolve(args.html);
if (!existsSync(htmlPath)) {
  console.error(`エラー: HTML が見つかりません: ${htmlPath}`);
  process.exit(1);
}
if (args.audio && !existsSync(path.resolve(args.audio))) {
  console.error(`エラー: 音声ファイルが見つかりません: ${args.audio}`);
  process.exit(1);
}

const { chromium } = require('playwright-core');
const ffmpeg = findFfmpeg();
const totalFrames = Math.round(args.duration * args.fps);
const framesDir = mkdtempSync(path.join(os.tmpdir(), 'vv-frames-'));

console.log(`==> レンダリング: ${totalFrames}フレーム (${args.duration}s @ ${args.fps}fps, ${args.width}x${args.height})`);

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1,
  });
  await page.goto(`file://${htmlPath}`);
  await page.evaluate(() => document.fonts.ready);
  // 全アニメーションを一時停止し、以後は currentTime のシークだけで描画を進める
  await page.evaluate(() => {
    for (const a of document.getAnimations({ subtree: true })) a.pause();
  });

  for (let i = 0; i < totalFrames; i++) {
    const t = (i * 1000) / args.fps;
    await page.evaluate((tMs) => {
      for (const a of document.getAnimations({ subtree: true })) a.currentTime = tMs;
      if (typeof window.seek === 'function') window.seek(tMs);
    }, t);
    await page.screenshot({ path: path.join(framesDir, `f${String(i).padStart(6, '0')}.png`) });
    if (i % args.fps === 0) console.log(`    ${(t / 1000).toFixed(1)}s / ${args.duration}s`);
  }
} finally {
  await browser.close();
}

console.log('==> エンコード (H.264)');
const ffArgs = ['-y', '-framerate', String(args.fps), '-i', path.join(framesDir, 'f%06d.png')];
if (args.audio) ffArgs.push('-i', path.resolve(args.audio));
ffArgs.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
if (args.audio) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
ffArgs.push(path.resolve(args.out));
execFileSync(ffmpeg, ffArgs, { stdio: ['ignore', 'inherit', 'inherit'] });

rmSync(framesDir, { recursive: true, force: true });
console.log(`==> 完了: ${path.resolve(args.out)}`);
