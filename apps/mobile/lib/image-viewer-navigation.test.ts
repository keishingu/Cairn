import { describe, expect, it } from 'vitest'
import {
  isHorizontalDrag,
  resolveSwipe,
  resolveViewerImages,
  stepImageIndex,
} from './image-viewer-navigation'

const image = (id: string) => ({ id, mimeType: 'image/png' })

describe('resolveViewerImages', () => {
  it('同じメッセージの画像だけを残し、開いた画像の位置を返す', () => {
    const attachments = [
      image('a'),
      { id: 'pdf', mimeType: 'application/pdf' },
      image('b'),
      { id: 'unknown', mimeType: null },
      image('c'),
    ]
    const result = resolveViewerImages(attachments, attachments[2]!)
    expect(result.images.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.index).toBe(1)
  })

  it('メッセージの添付が見つからないときは開いた 1 枚だけを返す', () => {
    const current = image('x')
    expect(resolveViewerImages(undefined, current)).toEqual({ images: [current], index: 0 })
    expect(resolveViewerImages([image('a')], current)).toEqual({ images: [current], index: 0 })
  })
})

describe('resolveSwipe', () => {
  it('右へ十分動かすと前、左へ動かすと次になる', () => {
    expect(resolveSwipe(60, 5)).toBe('prev')
    expect(resolveSwipe(-60, 5)).toBe('next')
  })

  it('移動量が足りない、または縦の動きのほうが大きいときは何もしない', () => {
    expect(resolveSwipe(47, 0)).toBeNull()
    expect(resolveSwipe(60, 80)).toBeNull()
    expect(resolveSwipe(60, 60)).toBeNull()
  })
})

describe('isHorizontalDrag', () => {
  it('小さな揺れや縦方向のドラッグは横ドラッグとみなさない', () => {
    expect(isHorizontalDrag(12, 0)).toBe(false)
    expect(isHorizontalDrag(20, 30)).toBe(false)
    expect(isHorizontalDrag(-20, 5)).toBe(true)
  })
})

describe('stepImageIndex', () => {
  it('前後に 1 枚ずつ動く', () => {
    expect(stepImageIndex(1, 3, 'prev')).toBe(0)
    expect(stepImageIndex(1, 3, 'next')).toBe(2)
  })

  it('最初と最後ではループせずその場に留まる', () => {
    expect(stepImageIndex(0, 3, 'prev')).toBe(0)
    expect(stepImageIndex(2, 3, 'next')).toBe(2)
  })
})
