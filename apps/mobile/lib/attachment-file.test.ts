import { describe, expect, it } from 'vitest'
import {
  attachmentCacheFileName,
  attachmentViewer,
  fitImageSize,
  isImageMime,
  isMarkdownDocument,
  isOfficeDocument,
  isPdfMime,
  isPreviewableAttachment,
  shouldReuseCachedFile,
} from './attachment-file'

describe('添付ファイルの表示とキャッシュ', () => {
  it('画像 MIME だけを画面内表示の対象にする', () => {
    expect(isImageMime('image/gif')).toBe(true)
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('application/pdf')).toBe(false)
    expect(isImageMime(null)).toBe(false)
  })

  it('PDF MIME だけを PDF ビューアの対象にする', () => {
    expect(isPdfMime('application/pdf')).toBe(true)
    expect(isPdfMime('application/octet-stream')).toBe(false)
    expect(isPdfMime('image/png')).toBe(false)
    expect(isPdfMime(null)).toBe(false)
  })

  it('画像と PDF は画面内で開き、それ以外は共有シートに回す', () => {
    expect(isPreviewableAttachment('image/jpeg', 'a.jpg', 'android')).toBe(true)
    expect(isPreviewableAttachment('application/pdf', 'a.pdf', 'android')).toBe(true)
    expect(isPreviewableAttachment('text/plain', 'a.txt', 'ios')).toBe(false)
    expect(isPreviewableAttachment(undefined, 'a', 'ios')).toBe(false)
  })

  it('Office ファイルは WebView が描画方法を決める拡張子だけで判定する', () => {
    expect(isOfficeDocument('a.docx')).toBe(true)
    expect(isOfficeDocument('見積.XLSX')).toBe(true)
    expect(isOfficeDocument('slides.pptx')).toBe(true)
    expect(isOfficeDocument('slides')).toBe(false)
    expect(isOfficeDocument('memo.txt')).toBe(false)
  })

  it('Office ファイルは iOS では画面内で開き、Android では共有シートに回す', () => {
    expect(isPreviewableAttachment('application/msword', 'a.doc', 'ios')).toBe(true)
    expect(isPreviewableAttachment('application/msword', 'a.doc', 'android')).toBe(false)
    // MIME だけ Office でも、拡張子が違えば HTML などとして描画されうるため画面内では開かない
    expect(isPreviewableAttachment('application/msword', 'a.html', 'ios')).toBe(false)
  })

  it('Markdown は Web と同じく MIME か拡張子で判定し、.txt は除く', () => {
    expect(isMarkdownDocument('text/markdown', 'notes')).toBe(true)
    expect(isMarkdownDocument('application/octet-stream', 'README.MD')).toBe(true)
    expect(isMarkdownDocument(null, 'a.markdown')).toBe(true)
    expect(isMarkdownDocument('text/markdown', 'a.txt')).toBe(false)
    expect(isMarkdownDocument('text/plain', 'a.mdx')).toBe(false)
  })

  it('Markdown は両 OS で画面内で開く', () => {
    expect(attachmentViewer('text/markdown', 'a.md', 'ios')).toBe('markdown')
    expect(attachmentViewer('text/markdown', 'a.md', 'android')).toBe('markdown')
    expect(attachmentViewer('image/png', 'a.md', 'android')).toBe('image')
  })

  it('画像と PDF は MIME を拡張子より優先してビューアを選ぶ', () => {
    expect(attachmentViewer('image/png', 'scan.docx', 'ios')).toBe('image')
    expect(attachmentViewer('application/pdf', 'report.xlsx', 'ios')).toBe('pdf')
    expect(attachmentViewer('application/octet-stream', 'report.xlsx', 'ios')).toBe('office')
    expect(attachmentViewer('application/octet-stream', 'report.xlsx', 'android')).toBeNull()
  })

  it('キャッシュ名はファイル ID を残し、パスに使えない文字を除く', () => {
    expect(attachmentCacheFileName('file-1', 'mention.gif')).toBe('file-1_mention.gif')
    expect(attachmentCacheFileName('file-1', 'a b/c')).toBe('file-1_a_b_c')
  })

  it('空でないキャッシュだけ再ダウンロードを省く', () => {
    expect(shouldReuseCachedFile({ exists: true, size: 12 })).toBe(true)
    expect(shouldReuseCachedFile({ exists: true, size: 0 })).toBe(false)
    expect(shouldReuseCachedFile({ exists: false })).toBe(false)
  })
})

describe('fitImageSize', () => {
  it('横長の画像は幅を上限に縦横比を保って縮小する', () => {
    expect(fitImageSize(2000, 1000, 280)).toEqual({ width: 280, height: 140 })
  })

  it('縦長の画像は高さを上限に縦横比を保って縮小する', () => {
    expect(fitImageSize(1000, 4000, 280)).toEqual({ width: 70, height: 280 })
  })

  it('上限より小さい画像は拡大しない', () => {
    expect(fitImageSize(100, 50, 280)).toEqual({ width: 100, height: 50 })
  })

  it('寸法が不正なら null を返す', () => {
    expect(fitImageSize(0, 100, 280)).toBeNull()
    expect(fitImageSize(100, Number.NaN, 280)).toBeNull()
  })
})
