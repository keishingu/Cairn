import { describe, expect, it } from 'vitest'
import { MAX_MESSAGE_ATTACHMENTS } from '@cairn/shared'
import { remainingAttachmentSlots } from './attachment-limit'

describe('remainingAttachmentSlots', () => {
  it('上限から現在の添付数を引いた残りを返す', () => {
    expect(remainingAttachmentSlots(0)).toBe(MAX_MESSAGE_ATTACHMENTS)
    expect(remainingAttachmentSlots(3)).toBe(MAX_MESSAGE_ATTACHMENTS - 3)
  })

  it('上限に達している、または超えているときは 0 を返す', () => {
    expect(remainingAttachmentSlots(MAX_MESSAGE_ATTACHMENTS)).toBe(0)
    expect(remainingAttachmentSlots(MAX_MESSAGE_ATTACHMENTS + 2)).toBe(0)
  })
})
