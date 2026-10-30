import { MAX_MESSAGE_ATTACHMENTS } from '@cairn/shared'

// 入力欄に並べられる残りの添付数（アップロード中・失敗中の行も枠を使う）
export function remainingAttachmentSlots(currentCount: number): number {
  return Math.max(0, MAX_MESSAGE_ATTACHMENTS - currentCount)
}
