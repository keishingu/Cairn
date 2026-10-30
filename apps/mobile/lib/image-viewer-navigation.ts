import { isImageMime } from './attachment-file'

// Web の画像ライトボックス（apps/web/src/components/app/image-lightbox-zoom.ts）と同じ値・規則
export const SWIPE_THRESHOLD = 48
// 横ドラッグとみなして子のタッチを奪い始める移動量
export const DRAG_SLOP = 12

type ViewerImage = { id: string; mimeType: string | null }

// 同じメッセージの画像だけを前後に送る。画像以外の添付は飛ばす。
// メッセージが見つからないときは、開いた 1 枚だけを表示する（閲覧操作なのでエラーにはしない）
export function resolveViewerImages<T extends ViewerImage>(
  attachments: readonly T[] | undefined,
  current: T,
): { images: T[]; index: number } {
  const images = (attachments ?? []).filter((attachment) => isImageMime(attachment.mimeType))
  const index = images.findIndex((attachment) => attachment.id === current.id)
  return index >= 0 ? { images, index } : { images: [current], index: 0 }
}

export function isHorizontalDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > DRAG_SLOP && Math.abs(dx) > Math.abs(dy)
}

// 等倍時の 1 本指スワイプを画像送りとして解釈する。右へ動かすと前、左へ動かすと次
export function resolveSwipe(dx: number, dy: number): 'prev' | 'next' | null {
  if (Math.abs(dx) < SWIPE_THRESHOLD) return null
  if (Math.abs(dx) <= Math.abs(dy)) return null
  return dx > 0 ? 'prev' : 'next'
}

// 端ではループせず止める（Web と同じ）。範囲外へは動かさず現在位置を返す
export function stepImageIndex(index: number, length: number, direction: 'prev' | 'next'): number {
  const next = direction === 'prev' ? index - 1 : index + 1
  return next < 0 || next >= length ? index : next
}
