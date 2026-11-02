import React from 'react'
import { StyleSheet } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview'
import pdfjsAssets from '../lib/pdfjs-assets'
import {
  buildPdfViewerHtml,
  findPdfBinaryData,
  PDF_VIEWER_BASE_URL,
  parsePdfViewerMessage,
  pdfReadRange,
  pdfViewerReplyScript,
  type PdfDocumentViewProps,
  type PdfViewerReply,
} from '../lib/pdf-viewer-html'

const BACKGROUND = '#000000'

// Android の PDF 表示。Pdfium（react-native-pdf）はページを画像として描くだけで文字を選べないため、
// 同梱の pdf.js を WebView で動かし、テキストレイヤーで長押しの選択・コピーをできるようにする。
// WebView にはファイルを読ませず、pdf.js が要求した範囲だけを表示中のファイルから読んで渡す
export function PdfDocumentView({
  uri,
  onLoadComplete,
  onPageChanged,
  onError,
  onPressLink,
}: PdfDocumentViewProps) {
  const webViewRef = React.useRef<WebView>(null)
  const [fileSize, setFileSize] = React.useState<number | null>(null)
  const failedRef = React.useRef(false)

  const fail = React.useCallback(
    (error: unknown) => {
      if (failedRef.current) return
      failedRef.current = true
      onError(error)
    },
    [onError],
  )

  React.useEffect(() => {
    let cancelled = false
    FileSystem.getInfoAsync(uri)
      .then((info) => {
        if (cancelled) return
        if (!info.exists || info.isDirectory || !info.size) throw new Error('PDF file is empty')
        setFileSize(info.size)
      })
      .catch((error: unknown) => {
        if (!cancelled) fail(error)
      })
    return () => {
      cancelled = true
    }
  }, [uri, fail])

  const html = React.useMemo(
    () =>
      fileSize === null
        ? null
        : buildPdfViewerHtml({
            library: pdfjsAssets.library,
            worker: pdfjsAssets.worker,
            fileSize,
            background: BACKGROUND,
          }),
    [fileSize],
  )

  const reply = (message: PdfViewerReply) => {
    webViewRef.current?.injectJavaScript(pdfViewerReplyScript(message))
  }

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parsePdfViewerMessage(event.nativeEvent.data)
    if (!message) {
      fail(new Error('Unexpected message from the PDF viewer'))
      return
    }
    switch (message.type) {
      case 'loaded':
        onLoadComplete(message.total)
        return
      case 'page':
        onPageChanged(message.current, message.total)
        return
      case 'link':
        onPressLink(message.url)
        return
      case 'error':
        fail(new Error(message.message || 'PDF viewer error'))
        return
      case 'range': {
        const range = fileSize === null ? null : pdfReadRange(message.begin, message.end, fileSize)
        if (!range) {
          reply({ id: message.id, error: 'out of range' })
          return
        }
        FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
          position: range.position,
          length: range.length,
        })
          .then((data) => reply({ id: message.id, data }))
          .catch((error: unknown) => {
            // PDF 本体が読めなければ表示を続けられないため、ビューア全体を失敗として扱う
            fail(error)
          })
        return
      }
      case 'binary': {
        const data = findPdfBinaryData(pdfjsAssets, message.kind, message.filename)
        reply(data === null ? { id: message.id, error: `not bundled: ${message.filename}` } : { id: message.id, data })
        return
      }
    }
  }

  // 自前の HTML 以外は読み込ませない。PDF 内のリンクは WebView の遷移ではなく 'link' メッセージで受け取る
  const allowNavigation = (request: WebViewNavigation) =>
    request.url === 'about:blank' || request.url === PDF_VIEWER_BASE_URL

  if (!html) return null
  return (
    <WebView
      ref={webViewRef}
      source={{ html, baseUrl: PDF_VIEWER_BASE_URL }}
      originWhitelist={['*']}
      // pdf.js を動かすために JavaScript を有効にする。PDF 内の JavaScript を実行する pdf.js の sandbox は同梱しない
      javaScriptEnabled
      // 表示中のファイルも含め、WebView からはファイルを直接読ませない
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      domStorageEnabled={false}
      cacheEnabled={false}
      setSupportMultipleWindows={false}
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      // 中央寄せの親の中で WebView の container の幅が 0 にならないよう、container 側を全面に広げる
      containerStyle={StyleSheet.absoluteFill}
      style={styles.webview}
      onShouldStartLoadWithRequest={allowNavigation}
      onMessage={handleMessage}
      onError={(event) => fail(new Error(event.nativeEvent.description))}
      onRenderProcessGone={() => fail(new Error('PDF viewer stopped'))}
    />
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: BACKGROUND },
})
