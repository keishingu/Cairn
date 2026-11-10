import { describe, expect, test } from 'vitest'
import { galleryImagesOf, initialGallerySelection } from './message-gallery'

describe('galleryImagesOf', () => {
  test('ギャラリーに置ける画像形式の添付だけを返す（Web と同じ判定）', () => {
    const images = galleryImagesOf([
      { fileId: 'a', fileName: 'a.jpg', mimeType: 'image/jpeg' },
      { fileId: 'b', fileName: 'b.pdf', mimeType: 'application/pdf' },
      { fileId: 'c', fileName: 'c.mp4', mimeType: 'video/mp4' },
      { fileId: 'd', fileName: 'd.webp', mimeType: 'image/webp' },
    ])

    expect(images).toEqual([
      { fileId: 'a', fileName: 'a.jpg' },
      { fileId: 'd', fileName: 'd.webp' },
    ])
  })
})

describe('initialGallerySelection', () => {
  test('追加済みでない画像をすべて選んだ状態にする', () => {
    const selection = initialGallerySelection(
      [
        { fileId: 'a', fileName: 'a' },
        { fileId: 'b', fileName: 'b' },
      ],
      ['a'],
    )

    expect([...selection]).toEqual(['b'])
  })
})
