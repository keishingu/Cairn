// Android のチャット添付 PDF を WebView の pdf.js で表示する HTML と、WebView とのやりとりを作る。
// react-native-pdf の Android 版（Pdfium）はページを画像として描くだけで文字を選べないため、
// pdf.js のテキストレイヤーで長押しの選択・コピーをできるようにする。
// WebView にはファイルの読み取り権限を与えず、PDF 本体は pdf.js が必要とする範囲だけを
// アプリが表示中のファイルから読んで渡す（大きな PDF でも全体を一度にメモリへ載せない）

export type PdfDocumentViewProps = {
  // attachment-cache.ts のキャッシュ（file://）
  uri: string
  onLoadComplete: (total: number) => void
  onPageChanged: (current: number, total: number) => void
  onError: (error: unknown) => void
  onPressLink: (url: string) => void
}

export type PdfViewerAssets = {
  library: string
  worker: string
  cMaps: Record<string, string>
  wasm: Record<string, string>
}

export type PdfViewerMessage =
  | { type: 'loaded'; total: number }
  | { type: 'page'; current: number; total: number }
  | { type: 'link'; url: string }
  | { type: 'error'; message: string }
  | { type: 'range'; id: number; begin: number; end: number }
  | { type: 'binary'; id: number; kind: string; filename: string }

export type PdfViewerReply = { id: number; data: string } | { id: number; error: string }

// WebView の HTML の基準 URL。HTML 文字列から開いたページ（about:blank）にも決まったオリジンを与え、
// blob: で読み込む pdf.js 本体を同じオリジンのものとして扱わせる。.invalid は名前解決されず、外部への接続は CSP で止めている
export const PDF_VIEWER_BASE_URL = 'https://pdf-viewer.cairn.invalid/'

// pdf.js が1回に要求する最大の範囲。WebView への受け渡しの回数と1回の大きさの釣り合い
const RANGE_CHUNK_SIZE = 256 * 1024
const PAGE_GAP = 8
// 1ページのキャンバスの上限（画素数）。拡大しても端末のメモリを使い切らないよう抑える
const MAX_CANVAS_PIXELS = 6_000_000
// 表示中のページの前後に何画面分を描いておくか、どこまで離れたら描画を捨てるか
const RENDER_MARGIN = '100%'
const RELEASE_MARGIN = '300%'

// `</script>` などで HTML を抜け出せないよう、`<` `>` `&` と行区切り文字も Unicode エスケープする
function toScriptLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// 外部からは何も読み込ませない。pdf.js 本体（blob:）と worker（data:）は同梱のソースから起動し、
// 画像復号の wasm だけ実行を許す（文字列からのコード実行 eval は許さない）
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob: 'wasm-unsafe-eval'",
  'worker-src data:',
  "style-src 'unsafe-inline'",
  'img-src blob: data:',
  'font-src blob: data:',
].join('; ')

export function buildPdfViewerHtml({
  library,
  worker,
  fileSize,
  background,
}: {
  library: string
  worker: string
  fileSize: number
  background: string
}): string {
  const config = {
    library,
    worker,
    fileSize,
    rangeChunkSize: RANGE_CHUNK_SIZE,
    pageGap: PAGE_GAP,
    maxCanvasPixels: MAX_CANVAS_PIXELS,
    renderMargin: RENDER_MARGIN,
    releaseMargin: RELEASE_MARGIN,
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5">
<style>
  html, body { margin: 0; background: ${background}; }
  body { -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  #pages { display: flex; flex-direction: column; gap: ${PAGE_GAP}px; }
  .page {
    position: relative;
    margin: 0 auto;
    background: #FFFFFF;
    overflow: hidden;
    --scale-round-x: 1px;
    --scale-round-y: 1px;
  }
  .page > canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  /* pdf.js の pdf_viewer.css のテキストレイヤー部分（入れ子の CSS を使わない形に直したもの） */
  .textLayer {
    position: absolute; text-align: initial; inset: 0; overflow: clip; opacity: 1;
    line-height: 1; letter-spacing: normal; word-spacing: normal;
    -webkit-text-size-adjust: none; text-size-adjust: none; forced-color-adjust: none;
    transform-origin: 0 0; caret-color: CanvasText; z-index: 0;
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
  }
  .textLayer span, .textLayer br {
    color: transparent; position: absolute; white-space: pre; cursor: text;
    transform-origin: 0% 0%; -webkit-user-select: text; user-select: text;
  }
  .textLayer > :not(.markedContent), .textLayer .markedContent span:not(.markedContent) {
    z-index: 1;
    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
  }
  .textLayer .markedContent { display: contents; }
  .textLayer span[role="img"] { -webkit-user-select: none; user-select: none; cursor: default; }
  .textLayer ::selection { background: rgba(0, 100, 255, 0.3); color: transparent; }
  .textLayer br::selection { background: transparent; }
  .links { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
  .links > div { position: absolute; pointer-events: auto; }
</style>
</head>
<body>
<div id="pages"></div>
<script>
${PDF_VIEWER_SCRIPT.replace('__CONFIG__', () => toScriptLiteral(config))}
</script>
</body>
</html>`
}

// WebView の中で動くスクリプト。テストではなく実機（Android の WebView）で動かして確かめる部分なので、
// アプリ側とのやりとりの形（post / receive）だけを parsePdfViewerMessage と pdfViewerReplyScript に合わせる
const PDF_VIEWER_SCRIPT = String.raw`(function () {
  'use strict'
  var config = __CONFIG__
  var container = document.getElementById('pages')
  var failed = false

  function post(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message))
  }
  function fail(error) {
    if (failed) return
    failed = true
    post({ type: 'error', message: String((error && error.message) || error) })
  }

  // アプリへの問い合わせ（PDF の範囲、CMap・wasm）。返事は pdfViewerReplyScript が receive を呼ぶ
  var pending = new Map()
  var nextId = 1
  function request(message) {
    return new Promise(function (resolve, reject) {
      var id = nextId++
      pending.set(id, { resolve: resolve, reject: reject })
      message.id = id
      post(message)
    })
  }
  function decodeBase64(base64) {
    var binary = atob(base64)
    var bytes = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  window.cairnPdf = {
    receive: function (reply) {
      var entry = pending.get(reply.id)
      if (!entry) return
      pending.delete(reply.id)
      if (typeof reply.error === 'string') entry.reject(new Error(reply.error))
      else entry.resolve(decodeBase64(reply.data))
    },
  }

  function BinaryDataFactory() {}
  BinaryDataFactory.prototype.fetch = function (params) {
    return request({ type: 'binary', kind: params.kind, filename: params.filename })
  }

  function toBlobUrl(source) {
    return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  }

  var pdfjs = null
  var pdf = null
  var pages = []
  var layoutWidth = 0
  var currentPage = 0
  var loadedPosted = false

  function availableWidth() {
    return document.documentElement.clientWidth
  }
  function zoomScale() {
    return (window.visualViewport && window.visualViewport.scale) || 1
  }

  // 幅に合わせたときの CSS ピクセル / PDF ポイント
  function cssScaleOf(entry) {
    return layoutWidth / entry.width
  }
  function applySize(entry) {
    var scale = cssScaleOf(entry)
    entry.div.style.width = layoutWidth + 'px'
    entry.div.style.height = Math.round(entry.height * scale) + 'px'
    entry.div.style.setProperty('--total-scale-factor', String(scale * entry.userUnit))
  }

  function createPages(total, firstPage) {
    var size = firstPage.getViewport({ scale: 1 })
    for (var i = 0; i < total; i++) {
      var div = document.createElement('div')
      div.className = 'page'
      div.dataset.index = String(i)
      // 実際の大きさはそのページを読み込んだときに直す。それまでは1ページ目と同じ大きさで並べる
      var entry = {
        index: i,
        div: div,
        width: size.width,
        height: size.height,
        userUnit: firstPage.userUnit || 1,
        page: null,
        wanted: false,
        canvas: null,
        renderedScale: 0,
        renderTask: null,
        textLayer: null,
        links: null,
      }
      applySize(entry)
      container.appendChild(div)
      pages.push(entry)
    }
  }

  // 描画は1ページずつ、画面の中央に近いページから順に行う
  var queue = new Set()
  var busy = false
  function enqueue(entry) {
    queue.add(entry)
    pump()
  }
  function viewportCenter() {
    var vv = window.visualViewport
    return vv ? vv.pageTop + vv.height / 2 : window.scrollY + window.innerHeight / 2
  }
  function nextFromQueue() {
    var center = viewportCenter()
    var best = null
    var bestDistance = Infinity
    queue.forEach(function (entry) {
      var top = entry.div.offsetTop
      var distance = Math.abs(top + entry.div.offsetHeight / 2 - center)
      if (distance < bestDistance) {
        best = entry
        bestDistance = distance
      }
    })
    if (best) queue.delete(best)
    return best
  }
  function pump() {
    if (busy || failed) return
    var entry = nextFromQueue()
    if (!entry) return
    busy = true
    renderPage(entry)
      .catch(function (error) {
        // 画面から離れて描画を取りやめたページの中断は失敗ではない
        if (!entry.wanted) return
        if (error && (error.name === 'RenderingCancelledException' || error.name === 'AbortException')) return
        fail(error)
      })
      .then(function () {
        busy = false
        pump()
      })
  }

  function isOnScreen(entry) {
    var vv = window.visualViewport
    var top = entry.div.offsetTop
    var bottom = top + entry.div.offsetHeight
    var viewTop = vv ? vv.pageTop : window.scrollY
    var viewBottom = viewTop + (vv ? vv.height : window.innerHeight)
    return bottom > viewTop && top < viewBottom
  }

  // 拡大中は画面に見えているページだけ細かく描き直し、文字がぼやけないようにする
  function outputScaleFor(entry) {
    var ratio = window.devicePixelRatio || 1
    var scale = isOnScreen(entry) ? ratio * zoomScale() : ratio
    var cssWidth = layoutWidth
    var cssHeight = entry.height * cssScaleOf(entry)
    var limit = Math.sqrt(config.maxCanvasPixels / (cssWidth * cssHeight))
    return Math.max(1, Math.min(scale, limit))
  }

  async function renderPage(entry) {
    if (!entry.wanted) return
    if (!entry.page) {
      var loaded = await pdf.getPage(entry.index + 1)
      if (!entry.wanted) return
      entry.page = loaded
      var size = loaded.getViewport({ scale: 1 })
      if (size.width !== entry.width || size.height !== entry.height) {
        entry.width = size.width
        entry.height = size.height
        applySize(entry)
      }
      entry.userUnit = loaded.userUnit || 1
    }
    // 描画の途中で release されても、このページの処理は同じ page で終える
    var page = entry.page
    var outputScale = outputScaleFor(entry)
    if (entry.canvas && Math.abs(entry.renderedScale - outputScale) / outputScale < 0.15) return

    var viewport = page.getViewport({ scale: cssScaleOf(entry) })
    var canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    var task = page.render({
      canvas: canvas,
      canvasContext: canvas.getContext('2d'),
      viewport: viewport,
      transform: [outputScale, 0, 0, outputScale, 0, 0],
    })
    entry.renderTask = task
    try {
      await task.promise
    } finally {
      entry.renderTask = null
    }
    if (!entry.wanted) {
      canvas.width = 0
      canvas.height = 0
      return
    }
    // 描き直しは描き終わってから差し替え、拡大中に白く抜けないようにする
    if (entry.canvas) {
      entry.canvas.width = 0
      entry.canvas.height = 0
      entry.canvas.remove()
    }
    entry.div.insertBefore(canvas, entry.div.firstChild)
    entry.canvas = canvas
    entry.renderedScale = outputScale

    if (!entry.textLayer) {
      var textDiv = document.createElement('div')
      textDiv.className = 'textLayer'
      entry.div.appendChild(textDiv)
      entry.textLayer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
        container: textDiv,
        viewport: viewport,
      })
      entry.textLayerDiv = textDiv
      await entry.textLayer.render()
      await renderLinks(entry, page, viewport)
    }

    if (!loadedPosted) {
      loadedPosted = true
      post({ type: 'loaded', total: pages.length })
      updateCurrentPage()
    }
  }

  // PDF 内のリンク。URL はアプリへ渡し（チャット本文と同じ判定で開く）、文書内の移動はその場でスクロールする
  async function renderLinks(entry, page, viewport) {
    var annotations = await page.getAnnotations({ intent: 'display' })
    if (!entry.wanted || !entry.textLayer) return
    var layer = document.createElement('div')
    layer.className = 'links'
    annotations.forEach(function (annotation) {
      if (annotation.subtype !== 'Link' || (!annotation.url && !annotation.dest)) return
      var start = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1])
      var end = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3])
      var rect = [start[0], start[1], end[0], end[1]]
      var left = Math.min(rect[0], rect[2])
      var top = Math.min(rect[1], rect[3])
      var link = document.createElement('div')
      link.setAttribute('role', 'link')
      link.style.left = (left / viewport.width) * 100 + '%'
      link.style.top = (top / viewport.height) * 100 + '%'
      link.style.width = (Math.abs(rect[2] - rect[0]) / viewport.width) * 100 + '%'
      link.style.height = (Math.abs(rect[3] - rect[1]) / viewport.height) * 100 + '%'
      link.addEventListener('click', function (event) {
        event.preventDefault()
        if (annotation.url) post({ type: 'link', url: annotation.url })
        else goToDestination(annotation.dest)
      })
      layer.appendChild(link)
    })
    entry.links = layer
    entry.div.appendChild(layer)
  }

  async function goToDestination(dest) {
    try {
      var explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
      if (!Array.isArray(explicit)) return
      var target = explicit[0]
      var index =
        target && typeof target === 'object' ? await pdf.getPageIndex(target) : Number.isInteger(target) ? target : -1
      if (pages[index]) window.scrollTo(0, pages[index].div.offsetTop)
    } catch (error) {
      // 壊れた文書内リンクはタップしても移動しないだけにする（表示中の文書は読めるため、全体をエラーにしない）
      console.warn('[pdf] 文書内リンクの移動先を解決できませんでした', error)
    }
  }

  // 画面から十分離れたページの描画を捨て、大きな PDF でもメモリを使い続けないようにする
  function release(entry) {
    entry.wanted = false
    queue.delete(entry)
    if (entry.renderTask) entry.renderTask.cancel()
    if (entry.canvas) {
      entry.canvas.width = 0
      entry.canvas.height = 0
      entry.canvas.remove()
      entry.canvas = null
    }
    if (entry.textLayer) {
      entry.textLayer.cancel()
      entry.textLayer = null
      entry.textLayerDiv.remove()
      entry.textLayerDiv = null
    }
    if (entry.links) {
      entry.links.remove()
      entry.links = null
    }
    entry.renderedScale = 0
    if (entry.page) {
      entry.page.cleanup()
      entry.page = null
    }
  }

  function observe() {
    var renderObserver = new IntersectionObserver(
      function (records) {
        records.forEach(function (record) {
          if (!record.isIntersecting) return
          var entry = pages[Number(record.target.dataset.index)]
          entry.wanted = true
          enqueue(entry)
        })
      },
      { rootMargin: config.renderMargin + ' 0px' },
    )
    var releaseObserver = new IntersectionObserver(
      function (records) {
        records.forEach(function (record) {
          if (record.isIntersecting) return
          release(pages[Number(record.target.dataset.index)])
        })
      },
      { rootMargin: config.releaseMargin + ' 0px' },
    )
    pages.forEach(function (entry) {
      renderObserver.observe(entry.div)
      releaseObserver.observe(entry.div)
    })
  }

  function updateCurrentPage() {
    if (!loadedPosted) return
    var center = viewportCenter()
    // ページは上から順に並んでいるため、中央の位置を含むページを二分探索で探す
    var low = 0
    var high = pages.length - 1
    while (low < high) {
      var middle = Math.ceil((low + high) / 2)
      if (pages[middle].div.offsetTop <= center) low = middle
      else high = middle - 1
    }
    if (low + 1 !== currentPage) {
      currentPage = low + 1
      post({ type: 'page', current: currentPage, total: pages.length })
    }
  }

  var frameRequested = false
  function onScroll() {
    if (frameRequested) return
    frameRequested = true
    requestAnimationFrame(function () {
      frameRequested = false
      updateCurrentPage()
    })
  }

  var zoomTimer = 0
  function onViewportResize() {
    onScroll()
    clearTimeout(zoomTimer)
    zoomTimer = setTimeout(function () {
      // 画面の回転などで幅が変わったら並べ直す（ピンチの拡大では変わらない）
      var width = availableWidth()
      if (width !== layoutWidth) {
        layoutWidth = width
        pages.forEach(applySize)
      }
      pages.forEach(function (entry) {
        if (entry.wanted && entry.canvas) enqueue(entry)
      })
    }, 250)
  }

  async function start() {
    var library = toBlobUrl(config.library)
    pdfjs = await import(library)
    // Android の WebView では blob: の worker の起動が拒否されたため、data: で起動する
    var worker = new Worker('data:text/javascript;charset=utf-8,' + encodeURIComponent(config.worker), {
      type: 'module',
    })
    // worker を起動できないと pdf.js は読み込み中のまま止まるため、失敗として知らせる
    worker.addEventListener('error', function (event) {
      fail(new Error('PDF worker: ' + (event.message || 'failed to start')))
    })
    pdfjs.GlobalWorkerOptions.workerPort = worker

    var transport = new pdfjs.PDFDataRangeTransport(config.fileSize, null)
    transport.requestDataRange = function (begin, end) {
      request({ type: 'range', begin: begin, end: end })
        .then(function (bytes) {
          transport.onDataRange(begin, bytes)
        })
        .catch(fail)
    }

    pdf = await pdfjs.getDocument({
      range: transport,
      length: config.fileSize,
      rangeChunkSize: config.rangeChunkSize,
      disableAutoFetch: true,
      disableStream: true,
      // CMap と wasm は worker から取りに行かず、このページ経由でアプリの同梱データを使う
      useWorkerFetch: false,
      BinaryDataFactory: BinaryDataFactory,
      cMapUrl: 'cairn-cmaps/',
      cMapPacked: true,
      wasmUrl: 'cairn-wasm/',
      isEvalSupported: false,
      enableXfa: false,
      verbosity: 0,
    }).promise
    if (pdf.numPages < 1) throw new Error('PDF has no pages')

    layoutWidth = availableWidth()
    createPages(pdf.numPages, await pdf.getPage(1))
    observe()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onViewportResize)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', onScroll)
      window.visualViewport.addEventListener('resize', onViewportResize)
    }
  }

  start().catch(fail)
})()`

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0
}

// WebView からのメッセージを検証する。想定外の形は null を返し、呼び出し側で表示失敗として扱う
export function parsePdfViewerMessage(data: string): PdfViewerMessage | null {
  let value: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return null
    value = parsed as Record<string, unknown>
  } catch {
    return null
  }
  switch (value['type']) {
    case 'loaded':
      return isPositiveInteger(value['total']) ? { type: 'loaded', total: value['total'] } : null
    case 'page': {
      const current = value['current']
      const total = value['total']
      return isPositiveInteger(current) && isPositiveInteger(total) && current <= total
        ? { type: 'page', current, total }
        : null
    }
    case 'link':
      return typeof value['url'] === 'string' && value['url'] !== '' ? { type: 'link', url: value['url'] } : null
    case 'error':
      return { type: 'error', message: typeof value['message'] === 'string' ? value['message'] : '' }
    case 'range': {
      const id = value['id']
      const begin = value['begin']
      const end = value['end']
      return isPositiveInteger(id) && isNonNegativeInteger(begin) && isNonNegativeInteger(end) && begin < end
        ? { type: 'range', id, begin, end }
        : null
    }
    case 'binary': {
      const id = value['id']
      const kind = value['kind']
      const filename = value['filename']
      return isPositiveInteger(id) && typeof kind === 'string' && typeof filename === 'string'
        ? { type: 'binary', id, kind, filename }
        : null
    }
    default:
      return null
  }
}

// pdf.js が要求した CMap・wasm を同梱データから探す。見つからなければ null（pdf.js が代替の描画に切り替える）
export function findPdfBinaryData(
  assets: Pick<PdfViewerAssets, 'cMaps' | 'wasm'>,
  kind: string,
  filename: string,
): string | null {
  const table = kind === 'cMapUrl' ? assets.cMaps : kind === 'wasmUrl' ? assets.wasm : null
  if (!table || !Object.prototype.hasOwnProperty.call(table, filename)) return null
  return table[filename] ?? null
}

// 要求された範囲を、ファイルの大きさに収まる読み取り位置と長さにする。範囲外の要求は null
export function pdfReadRange(
  begin: number,
  end: number,
  fileSize: number,
): { position: number; length: number } | null {
  if (begin >= fileSize) return null
  const clampedEnd = Math.min(end, fileSize)
  return { position: begin, length: clampedEnd - begin }
}

// 問い合わせへの返事を WebView で実行するスクリプト
export function pdfViewerReplyScript(reply: PdfViewerReply): string {
  return `window.cairnPdf && window.cairnPdf.receive(${toScriptLiteral(reply)});true;`
}
