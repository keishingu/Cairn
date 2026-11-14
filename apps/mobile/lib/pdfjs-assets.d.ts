// metro-pdfjs-transformer.js が生成するモジュールの型
declare const assets: {
  version: string
  // pdf.js 本体と worker の ES モジュールのソース
  library: string
  worker: string
  // ファイル名 → base64
  cMaps: Record<string, string>
  wasm: Record<string, string>
}

export = assets
