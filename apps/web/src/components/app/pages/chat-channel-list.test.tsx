// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChannelList } from './chat-channel-list'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'

const DM: DmChannelDto = {
  id: 'dm-1',
  participantId: 'user-2',
  participantName: 'Alice',
  participantAvatarUrl: null,
  participantStatus: 'busy',
  participantStatusMessage: null,
  unreadCount: 0,
  unreadMentionCount: 0,
}

describe('ChannelList DM status', () => {
  it('DM の一覧に participant status を表示する', () => {
    render(
      <ChannelList
        channelId={null}
        onSelectChannel={() => {}}
        projectChannels={[]}
        workspaceChannels={[]}
        dms={[DM]}
        members={[]}
        onAddChannel={() => {}}
        onStartDm={() => {}}
      />,
    )

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('取り込み中')).toBeInTheDocument()
  })

  it('statusMessage があれば label より優先する', () => {
    render(
      <ChannelList
        channelId={null}
        onSelectChannel={() => {}}
        projectChannels={[]}
        workspaceChannels={[]}
        dms={[{ ...DM, participantStatus: 'away', participantStatusMessage: '会議中です' }]}
        members={[]}
        onAddChannel={() => {}}
        onStartDm={() => {}}
      />,
    )

    expect(screen.getByText('会議中です')).toBeInTheDocument()
    expect(screen.queryByText('退席中')).toBeNull()
  })
})
