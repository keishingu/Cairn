// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Android の PDF ビューア（WebView の pdf.js）に渡す pdfjs-dist の中身を、アプリの JS バンドルへ同梱する。
// pdf.js は WebView の中でモジュールとして動かすため、通常の import ではなく文字列として持つ必要がある。
// lib/pdfjs-assets.js をこの変換で生成したモジュールに置き換え、EAS Update でも同じ版が届くようにする
// （CDN から読み込まない・ネイティブ側のアセットにもしない）
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const upstream = require(
  require.resolve('@expo/metro-config/build/babel-transformer', {
    paths: [path.dirname(require.resolve('expo/package.json', { paths: [__dirname] }))],
  }),
)

const ASSETS_MODULE = path.join(__dirname, 'lib', 'pdfjs-assets.js')
const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json', { paths: [__dirname] }))
const PDFJS_VERSION = require(path.join(PDFJS_ROOT, 'package.json')).version

// スキャンした PDF に多い画像形式（JPEG 2000 / JBIG2）の復号に使う wasm。
// ICC の色変換（qcms）は worker からの直接取得でしか使われず、PDF 内の JavaScript を実行する
// quickjs-eval はビューアで動かさないため、どちらも含めない
const WASM_FILES = ['openjpeg.wasm', 'jbig2.wasm']

// Hermes は ASCII 以外を含む文字列を UTF-16 で持ち、pdf.js の分だけバンドルが倍になる。
// 数百文字しかない ASCII 以外の文字を \uXXXX に置き換え、ソースを ASCII のまま同梱する。
// 文字列・正規表現・識別子・コメントのどこでも同じ意味になるが、直前が \ の文字や
// サロゲートペアは意味が変わり得るため、pdfjs-dist の更新でそれが現れたらビルドを止める
function toAsciiSource(source, name) {
  if (/\\[^\x00-\x7f]|[\ud800-\udfff]|String\.raw/.test(source)) {
    throw new Error(`${name} に ASCII へ置き換えられない文字があります`)
  }
  return source.replace(/[^\x00-\x7f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function readSource(file) {
  return toAsciiSource(fs.readFileSync(path.join(PDFJS_ROOT, file), 'utf8'), file)
}

function readBase64(...segments) {
  return fs.readFileSync(path.join(PDFJS_ROOT, ...segments)).toString('base64')
}

function buildAssetsModule() {
  const cMaps = {}
  for (const name of fs.readdirSync(path.join(PDFJS_ROOT, 'cmaps')).sort()) {
    // 日本語など、フォントを埋め込まない PDF の文字の対応表（Adobe の CMap）
    if (name.endsWith('.bcmap')) cMaps[name] = readBase64('cmaps', name)
  }
  const wasm = {}
  for (const name of WASM_FILES) wasm[name] = readBase64('wasm', name)
  const assets = {
    version: PDFJS_VERSION,
    // 古い WebView でも動くよう legacy ビルドを使う
    library: readSource('legacy/build/pdf.min.mjs'),
    worker: readSource('legacy/build/pdf.worker.min.mjs'),
    cMaps,
    wasm,
  }
  return `module.exports = ${JSON.stringify(assets)}\n`
}

module.exports = {
  transform(args) {
    const filename = path.resolve(args.options.projectRoot, args.filename)
    if (filename !== ASSETS_MODULE) return upstream.transform(args)
    return upstream.transform({ ...args, src: buildAssetsModule() })
  },
  // 置き換え前のファイルは変わらないため、pdfjs-dist かこの変換を更新したらキャッシュを使わず作り直す
  getCacheKey() {
    const self = crypto.createHash('sha1').update(fs.readFileSync(__filename)).digest('hex')
    return `pdfjs-dist@${PDFJS_VERSION}:${self}`
  },
}
