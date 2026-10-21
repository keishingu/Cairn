// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  MESSAGE_BLOCK_FIXTURES,
  allElementsFixture,
  nothingRenderableFixture,
  pollCardFixture,
  unsupportedFixture,
} from '@cairn/shared/blocks/fixtures'
import { MessageCard } from './message-card'

const MENTION_USER_ID = '00000000-0000-4000-8000-000000000001'
const mentionNames = new Map([[MENTION_USER_ID, '山田']])

describe('カード型メッセージの描画', () => {
  it('全 fixture を例外なく描ける', () => {
    for (const fixture of Object.values(MESSAGE_BLOCK_FIXTURES)) {
      const { unmount } = render(<MessageCard blocks={fixture} fallbackText="代替テキスト" />)
      unmount()
    }
  })

  it('投票カードの見出し・本文・メンション・ボタンを描く', () => {
    render(<MessageCard blocks={pollCardFixture} fallbackText="" mentionNames={mentionNames} />)

    expect(screen.getByText('11月の登山本部 担当決め')).toBeInTheDocument()
    expect(screen.getByText('担当できる週')).toContainHTML('')
    expect(screen.getByText('担当できる週').tagName).toBe('STRONG')
    expect(screen.getAllByText('@山田').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: '投票' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: '締め切る' })).toHaveClass('btn-danger')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('解決できないメンションは「不明なメンバー」にする', () => {
    render(<MessageCard blocks={pollCardFixture} fallbackText="" />)
    expect(screen.getAllByText('@不明なメンバー').length).toBeGreaterThan(0)
  })

  it('操作の送り先がなければボタンと選択肢を押せない表示にする', () => {
    render(<MessageCard blocks={allElementsFixture} fallbackText="" />)
    expect(screen.getByRole('button', { name: '主ボタン' })).toBeDisabled()
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled()
  })

  it('操作の送り先があれば、押したボタンと選んだ選択肢を block_id・action_id つきで渡す', () => {
    const onAction = vi.fn()
    render(<MessageCard blocks={pollCardFixture} fallbackText="" onAction={onAction} />)
    fireEvent.click(screen.getAllByRole('button', { name: '投票' })[1]!)
    expect(onAction).toHaveBeenCalledWith({ type: 'button', blockId: 'option-2', actionId: 'vote' })

    const select = { type: 'static_select', action_id: 'pick', options: [{ text: { type: 'plain_text', text: '参加' }, value: 'yes' }] }
    render(<MessageCard blocks={[{ type: 'actions', block_id: 'b', elements: [select] }]} fallbackText="" onAction={onAction} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yes' } })
    expect(onAction).toHaveBeenLastCalledWith({ type: 'static_select', blockId: 'b', actionId: 'pick', selectedOptionValue: 'yes' })
  })

  it('URL ボタンは新しいタブで開くリンクにする', () => {
    render(<MessageCard blocks={allElementsFixture} fallbackText="" />)
    const link = screen.getByRole('link', { name: '外部リンク' })
    expect(link).toHaveAttribute('href', 'https://example.com/docs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('外部画像は参照元を送らずに読み込む', () => {
    render(<MessageCard blocks={allElementsFixture} fallbackText="" />)
    expect(screen.getByAltText('ルート図')).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('知らない要素は黙って消さず、その位置に案内を出して残りを描く', () => {
    render(<MessageCard blocks={unsupportedFixture} fallbackText="" />)
    expect(screen.getByText('描ける本文')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '描けるボタン' })).toBeInTheDocument()
    expect(screen.getAllByRole('note')).toHaveLength(3)
    expect(screen.getAllByRole('note')[0]).toHaveTextContent('カードのこの部分はこのバージョンでは表示できません')
  })

  it('何も描けなければ代替テキストと案内を出す', () => {
    render(<MessageCard blocks={nothingRenderableFixture} fallbackText="*11月*の登山本部" />)
    expect(screen.getByText('11月').tagName).toBe('STRONG')
    expect(screen.getByRole('note')).toHaveTextContent('このカードはこのバージョンでは表示できません')
  })

  it('壊れた保存値でも例外にせず、代替テキストと案内を出す', () => {
    render(<MessageCard blocks={null} fallbackText="代替テキスト" />)
    expect(screen.getByText('代替テキスト')).toBeInTheDocument()
    expect(screen.getByRole('note')).toBeInTheDocument()
  })
})
