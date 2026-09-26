// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// index.html の render(t) をフレームごとに呼んで撮影し、ffmpeg で動画セグメントにする。
//   node render.mjs <startFrame> <endFrame> <out.mp4>   … セグメント書き出し（60fps）
//   node render.mjs --preview <秒> [<秒> ...]            … 指定時刻の静止画を preview/ に保存
// 環境変数 FORMAT=vertical で 1080x1920（9:16）の縦型を書き出す
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FPS = 60
const VERTICAL = process.env.FORMAT === 'vertical'
const [VW, VH] = VERTICAL ? [1080, 1920] : [1920, 1080]

async function loadChromium() {
  if (process.env.PLAYWRIGHT_MODULE) return (await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)).chromium
  try {
    return (await import('playwright')).chromium
  } catch {
    // グローバルインストール（npm i -g playwright）へのフォールバック
    const root = execFileSync('npm', ['root', '-g']).toString().trim()
    return (await import(pathToFileURL(join(root, 'playwright', 'index.mjs')).href)).chromium
  }
}

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim()
  } catch {
    return 'ffmpeg'
  }
}

const chromium = await loadChromium()
const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: VW, height: VH } })
const cdp = await page.context().newCDPSession(page)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(pathToFileURL(join(HERE, 'index.html')).href + (VERTICAL ? '?format=vertical' : ''))
await page.evaluate(() => window.ready)
// 全シーンを一度描画して、unicode-range で分割された日本語フォントを読み込ませる
for (let t = 0; t < 30; t += 0.25) await page.evaluate((t) => render(t), t)
await page.evaluate(() => document.fonts.ready)

const shot = async (t) => {
  await page.evaluate((t) => render(t), t)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
  return Buffer.from(data, 'base64')
}

if (process.argv[2] === '--preview') {
  const { writeFileSync } = await import('node:fs')
  mkdirSync(join(HERE, 'preview'), { recursive: true })
  for (const s of process.argv.slice(3).map(Number)) {
    writeFileSync(join(HERE, 'preview', `${VERTICAL ? 'v' : 't'}_${s.toFixed(2)}.png`), await shot(s))
  }
} else {
  const [f0, f1] = [Number(process.argv[2]), Number(process.argv[3])]
  const out = process.argv[4]
  // 新しいページの初回描画でテキストが欠けることがあるため、空撮りで温める
  for (let w = 0; w < 3; w++) await shot(f0 / FPS)
  const ff = spawn(
    ffmpegPath(),
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '9', '-pix_fmt', 'yuv444p', out],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  const t0 = Date.now()
  for (let i = f0; i < f1; i++) {
    const buf = await shot(i / FPS)
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if ((i - f0) % 120 === 0) console.log(`[${out}] ${i - f0}/${f1 - f0} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
  console.log(`[${out}] done ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
if (errors.length) console.error(errors.join('\n'))
await browser.close()
