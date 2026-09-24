import { describe, expect, it } from 'vitest'
import { attachmentCacheFileName, isImageMime, shouldReuseCachedFile } from './attachment-file'

describe('添付ファイルの表示とキャッシュ', () => {
  it('画像 MIME だけを画面内表示の対象にする', () => {
    expect(isImageMime('image/gif')).toBe(true)
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('application/pdf')).toBe(false)
    expect(isImageMime(null)).toBe(false)
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
