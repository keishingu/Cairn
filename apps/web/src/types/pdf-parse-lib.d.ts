// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// pdf-parse のエントリ (index.js) は module.parent が無い環境（サーバーレスの
// バンドル）でテスト用PDFを読み込むデバッグコードを実行し ENOENT で落ちる。
// 本体実装 (lib/pdf-parse.js) を直接読み込むためのサブパス用型宣言。
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFParseResult {
    text: string
    numpages: number
    info: unknown
    metadata: unknown
    version: string
  }
  function pdfParse(dataBuffer: Buffer): Promise<PDFParseResult>
  export default pdfParse
}
