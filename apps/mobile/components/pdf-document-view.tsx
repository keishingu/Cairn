import React from 'react'
import { StyleSheet, View } from 'react-native'
import Pdf from 'react-native-pdf'
import type { PdfDocumentViewProps } from '../lib/pdf-viewer-html'

// iOS の PDF 表示。PDFKit で描画し、長押しの文字選択もそのまま使える。
// Android は文字を選べるよう pdf-document-view.android.tsx（WebView の pdf.js）を使う
export function PdfDocumentView({
  uri,
  onLoadComplete,
  onPageChanged,
  onError,
  onPressLink,
}: PdfDocumentViewProps) {
  return (
    <Pdf
      source={{ uri }}
      style={styles.pdf}
      trustAllCerts={false}
      // 読み込み中は呼び出し側の共通スピナーを出すため、ライブラリ既定の進捗テキストは描画しない
      renderActivityIndicator={() => <View />}
      onLoadComplete={(numberOfPages) => onLoadComplete(numberOfPages)}
      onPageChanged={onPageChanged}
      onError={onError}
      onPressLink={onPressLink}
    />
  )
}

const styles = StyleSheet.create({
  pdf: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
})
