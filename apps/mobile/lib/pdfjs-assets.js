// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Metro のビルドでは metro-pdfjs-transformer.js が pdfjs-dist の中身（pdf.js 本体・worker・CMap・wasm）に
// 置き換える。変換を通らない環境（vitest など）で読み込まれたら、空の pdf.js で表示させず失敗させる
throw new Error('pdfjs-assets は Metro の変換（metro-pdfjs-transformer.js）を通して読み込む')
