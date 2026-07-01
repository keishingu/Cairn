// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileHeader } from './header'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}))

vi.mock('../app-shell-context', () => ({
  useAppShell: () => ({ openNotif: () => {} }),
}))

vi.mock('@/lib/notifications/client', () => ({
  useUnreadNotificationCount: () => 0,
}))

describe('MobileHeader の subtitle 表示', () => {
  it('長い subtitle を省略表示するスタイルを持つ', () => {
    const subtitle = 'とても長いステータスメッセージでもモバイルヘッダーの右側ボタンを押し出さないようにしたいです'

    render(<MobileHeader title="Alice" subtitle={subtitle} onBack={() => {}} />)

    expect(screen.getByText(subtitle)).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    })
    expect(screen.getByTitle(subtitle)).toBeInTheDocument()
  })
})
