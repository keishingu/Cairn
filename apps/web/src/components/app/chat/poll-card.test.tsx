import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PollCard } from './poll-card'

vi.mock('@/hooks/use-poll', () => ({
  usePoll: vi.fn(),
}))

import { usePoll } from '@/hooks/use-poll'

const mockUsePoll = vi.mocked(usePoll)

describe('PollCard', () => {
  it('poll データをカードとして表示する', () => {
    mockUsePoll.mockReturnValue({
      data: {
        id: 'poll-1',
        channelId: 'channel-1',
        messageId: 'message-1',
        question: '来週どこ行く？',
        allowMultiple: true,
        anonymous: false,
        createdBy: 'user-1',
        createdAt: '2026-07-10T00:00:00.000Z',
        options: [
          { id: 'option-1', text: 'A案', displayOrder: 0, voteCount: 0, voters: [] },
          { id: 'option-2', text: 'B案', displayOrder: 1, voteCount: 0, voters: [] },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof usePoll>)

    render(<PollCard messageId="message-1" fallbackQuestion="fallback" />)

    expect(screen.getByText('来週どこ行く？')).toBeInTheDocument()
    expect(screen.getByText('複数選択')).toBeInTheDocument()
    expect(screen.getByText('A案')).toBeInTheDocument()
    expect(screen.getAllByText('0票')).toHaveLength(2)
  })

  it('取得失敗時はエラーを表示する', () => {
    mockUsePoll.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof usePoll>)

    render(<PollCard messageId="message-1" fallbackQuestion="fallback" />)

    expect(screen.getByText('投票の取得に失敗しました')).toBeInTheDocument()
  })
})
