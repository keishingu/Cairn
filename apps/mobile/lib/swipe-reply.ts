import { hasHorizontalScrollBlock } from './mobile-markdown-source'

// この距離まで引いて離すと返信を始める
export const SWIPE_REPLY_THRESHOLD = 56
// 左へこれだけ動いてから応答する。縦はこれだけ動いたら諦めて一覧のスクロールに譲る
export const SWIPE_REPLY_ACTIVE_OFFSET = 10
// 画面右端から始まる指は Android のジェスチャーナビの戻るに譲る
export const SWIPE_REPLY_EDGE_INSET = 24
// 閾値を超えた分は指の動きを弱めて見せ、これ以上は動かさない
const OVERSHOOT_RESISTANCE = 0.3
const MAX_OFFSET = 80

type ReplyableMessage = { messageType: string; blocked?: boolean }
type SwipeableMessage = ReplyableMessage & { content: string }

// 長押しメニューの「返信」もスワイプもこの条件で決める。
// 削除済みのメッセージは API が返さないため、ここでは判定しない
export function canReplyToMessage(message: ReplyableMessage): boolean {
  return message.messageType !== 'system'
}

// ブロック中のメッセージは本文が見えないので、内容を確かめられる長押しメニューからだけ返信できる。
// 表とコードブロックは左へ動かして読み進めるため、スワイプを受け付けると読めなくなる（長押しからは返信できる）
export function canSwipeReply(message: SwipeableMessage): boolean {
  return canReplyToMessage(message) && !message.blocked && !hasHorizontalScrollBlock(message.content)
}

export function isSwipeReplyStart(absoluteX: number, screenWidth: number): boolean {
  'worklet'
  return absoluteX <= screenWidth - SWIPE_REPLY_EDGE_INSET
}

export function reachedSwipeReply(dx: number): boolean {
  'worklet'
  return dx <= -SWIPE_REPLY_THRESHOLD
}

export function swipeReplyOffset(dx: number): number {
  'worklet'
  if (dx >= 0) return 0
  if (dx >= -SWIPE_REPLY_THRESHOLD) return dx
  return -Math.min(MAX_OFFSET, SWIPE_REPLY_THRESHOLD + (-dx - SWIPE_REPLY_THRESHOLD) * OVERSHOOT_RESISTANCE)
}
