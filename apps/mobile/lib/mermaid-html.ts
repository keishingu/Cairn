// Mermaid 図を全画面の WebView で描画する HTML を作る。
// ネイティブには Mermaid の描画部品がないため、Web と同じ mermaid（バージョンを固定し、
// Subresource Integrity で改ざんされたスクリプトを実行しない）を WebView の中で読み込む
export const MERMAID_VERSION = '11.17.0'
const MERMAID_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`
const MERMAID_SCRIPT_INTEGRITY =
  'sha384-1XxYRbOYiiyu+pmHSGPcd+f1+ISteo+dnLpgQKUB07vPr9ddelj3zjO+TAbBqFXY'

export type MermaidTheme = {
  dark: boolean
  background: string
  surface: string
  accent: string
  accentSoft: string
  text: string
  text2: string
  text3: string
  border: string
}

export type MermaidMessage = { type: 'rendered' } | { type: 'error'; message: string }

// `</script>` などで HTML を抜け出せないよう、`<` `>` `&` と行区切り文字も Unicode エスケープする
function toScriptLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function buildMermaidHtml(definition: string, theme: MermaidTheme): string {
  // Web の MermaidDiagram と同じ設定（strict、HTML ラベル無効、上限値）で描画する
  const config = {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 20_000,
    maxEdges: 300,
    theme: 'base',
    themeVariables: {
      darkMode: theme.dark,
      background: theme.background,
      primaryColor: theme.accentSoft,
      primaryBorderColor: theme.accent,
      primaryTextColor: theme.text,
      secondaryColor: theme.surface,
      secondaryBorderColor: theme.border,
      secondaryTextColor: theme.text2,
      tertiaryColor: theme.surface,
      tertiaryBorderColor: theme.border,
      tertiaryTextColor: theme.text2,
      lineColor: theme.text3,
      textColor: theme.text,
      fontFamily: '-apple-system, system-ui, sans-serif',
    },
    flowchart: { htmlLabels: false, useMaxWidth: false },
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=6">
<style>
  html, body { margin: 0; background: ${theme.background}; }
  #diagram { padding: 16px; display: inline-block; min-width: calc(100% - 32px); }
  #diagram svg { display: block; max-width: none; height: auto; }
</style>
<script src="${MERMAID_SCRIPT_URL}" integrity="${MERMAID_SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
</head>
<body>
<div id="diagram"></div>
<script>
(function () {
  function post(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)) }
  if (typeof mermaid === 'undefined') {
    post({ type: 'error', message: 'script' })
    return
  }
  mermaid.initialize(${toScriptLiteral(config)})
  mermaid.render('cairn-mermaid', ${toScriptLiteral(definition)}).then(function (result) {
    document.getElementById('diagram').innerHTML = result.svg
    post({ type: 'rendered' })
  }).catch(function (error) {
    post({ type: 'error', message: String((error && error.message) || error) })
  })
})()
</script>
</body>
</html>`
}

export function parseMermaidMessage(data: string): MermaidMessage | null {
  try {
    const value = JSON.parse(data) as { type?: unknown; message?: unknown }
    if (value.type === 'rendered') return { type: 'rendered' }
    if (value.type === 'error') return { type: 'error', message: String(value.message ?? '') }
  } catch {
    // WebView からの想定外のメッセージは無視せず、呼び出し側で表示失敗として扱う
  }
  return null
}
