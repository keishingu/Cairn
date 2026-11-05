// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@cairn/shared'
import { VideoAttachment } from './video-attachment'

const rights = vi.hoisted(() => ({
  value: { data: undefined, isError: false, isFetching: false, refetch: vi.fn() } as {
    data: { canUploadVideo: boolean; canDownloadOriginal: boolean } | undefined
    isError: boolean
    isFetching: boolean
    refetch: () => Promise<unknown>
  },
}))
vi.mock('@/hooks/use-upload-rights', () => ({ useUploadRights: () => rights.value }))

describe('VideoAttachment', () => {
  beforeEach(() => {
    rights.value = { data: undefined, isError: false, isFetching: false, refetch: vi.fn(() => Promise.resolve()) }
  })

  it('圧縮版の保存は全員に、原本の保存は取得できる本人にだけ出す', () => {
    const { unmount } = render(<VideoAttachment fileId="f1" fileName="clip.mov" />)
    expect(screen.getByRole('link', { name: translate('ja', 'Download {name}', { name: 'clip.mov' }) })).toHaveAttribute(
      'href',
      '/api/attachments/f1?download=1',
    )
    expect(screen.queryByRole('link', { name: translate('ja', 'Download original') })).toBeNull()
    unmount()

    rights.value = { ...rights.value, data: { canUploadVideo: true, canDownloadOriginal: true } }
    render(<VideoAttachment fileId="f1" fileName="clip.mov" />)
    expect(screen.getByRole('link', { name: translate('ja', 'Download original') })).toHaveAttribute(
      'href',
      '/api/attachments/f1?original=1',
    )
  })

  it('支援状態を取得できないときは原本の項目を黙って隠さず、失敗と再試行を表示する', async () => {
    const refetch = vi.fn(() => Promise.resolve())
    rights.value = { data: undefined, isError: true, isFetching: false, refetch }
    render(<VideoAttachment fileId="f1" fileName="clip.mov" />)

    expect(screen.getByRole('alert')).toHaveTextContent(translate('ja', 'Could not check whether you can download original files.'))
    await userEvent.click(screen.getByRole('button', { name: translate('ja', 'Retry') }))
    expect(refetch).toHaveBeenCalled()
  })
})
