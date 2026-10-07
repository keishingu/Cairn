// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  buildProjectUpdateMessage,
  parseProjectUpdateMessage,
  projectUpdateChange,
  projectUpdateChangeKind,
  supersedeProjectUpdateMessages,
} from './project-update-message'

const now = new Date('2026-10-07T12:00:00Z')
const notBefore = new Date('2026-10-06T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

const { dates, status } = projectUpdateChange
const newDates = [dates('2026-10-20', '2026-10-21')]
const system = (id: string, minutes: number, ...changes: string[]) => ({
  id,
  messageType: 'system',
  content: buildProjectUpdateMessage('山田', changes),
  createdAt: minutesAgo(minutes),
})

describe('supersedeProjectUpdateMessages', () => {
  test('同じ項目を続けて変更したら、前の通知をすべて消して最後の1件だけ残す', () => {
    const recent = [
      system('m3', 1, dates('2026-10-18', '2026-10-17')),
      system('m2', 2, dates('2026-10-17', '2026-10-17')),
      system('m1', 3, dates('2026-10-18', '2026-10-17')),
    ]
    expect(supersedeProjectUpdateMessages(recent, newDates, notBefore)).toEqual({
      deleteIds: ['m3', 'm2', 'm1'],
      rewrites: [],
    })
  })

  test('別の項目の通知は残し、その先にある同じ項目の通知は消す', () => {
    const recent = [system('m2', 1, status('実施待ち')), system('m1', 2, dates('2026-10-17', '2026-10-17'))]
    expect(supersedeProjectUpdateMessages(recent, newDates, notBefore)).toEqual({
      deleteIds: ['m1'],
      rewrites: [],
    })
  })

  test('複数の項目をまとめた通知は、上書きされた項目だけを取り除く', () => {
    const recent = [system('m1', 1, status('計画中'), dates('2026-10-17', '2026-10-18'))]
    expect(supersedeProjectUpdateMessages(recent, newDates, notBefore)).toEqual({
      deleteIds: [],
      rewrites: [{ id: 'm1', content: '山田さんがプロジェクトを更新しました：ステータスを「計画中」に変更しました' }],
    })
  })

  test('間に誰かの投稿があれば、それより前の通知は会話の記録として残す', () => {
    const recent = [
      system('m3', 1, dates('2026-10-18', '2026-10-19')),
      { id: 'm2', messageType: 'text', content: '日程了解です', createdAt: minutesAgo(2) },
      system('m1', 3, dates('2026-10-17', '2026-10-17')),
    ]
    expect(supersedeProjectUpdateMessages(recent, newDates, notBefore).deleteIds).toEqual(['m3'])
  })

  test('24時間より前の通知は残す', () => {
    const recent = [system('m1', 25 * 60, dates('2026-10-17', '2026-10-17'))]
    expect(supersedeProjectUpdateMessages(recent, newDates, notBefore).deleteIds).toEqual([])
  })

  test('プロジェクト更新以外の system メッセージには手を付けない', () => {
    const recent = [{ id: 'm1', messageType: 'system', content: '期間を 過ぎました', createdAt: minutesAgo(1) }]
    expect(supersedeProjectUpdateMessages(recent, newDates, notBefore)).toEqual({ deleteIds: [], rewrites: [] })
  })
})

describe('parseProjectUpdateMessage', () => {
  test('プロジェクト名に区切り文字が含まれていても、名称変更として読み戻す', () => {
    const content = buildProjectUpdateMessage('山田', [projectUpdateChange.title('春 / 夏合宿'), status('計画中')])
    expect(parseProjectUpdateMessage(content)?.changes.map(projectUpdateChangeKind)).toEqual(['title', 'status'])
  })
})

describe('区切り文字を含むマイルストーン名', () => {
  const period = { startDate: '2026-10-17', endDate: '2026-10-18', startTime: null, endTime: null }
  const name = '設計 / 実装'

  test('名前に区切り文字があっても、項目として読み戻せる', () => {
    const content = buildProjectUpdateMessage('山田', [
      status('計画中'),
      projectUpdateChange.milestoneDates(name, period),
      projectUpdateChange.milestoneCompleted(name, true),
    ])
    expect(parseProjectUpdateMessage(content)?.changes.map(projectUpdateChangeKind)).toEqual([
      'status',
      `milestone-dates:${name}`,
      `milestone-completed:${name}`,
    ])
  })

  test('期間を続けて変更したら、前の通知を消して最後の1件だけ残す', () => {
    const recent = [
      { id: 'm1', messageType: 'system', content: buildProjectUpdateMessage('山田', [projectUpdateChange.milestoneDates(name, period)]), createdAt: minutesAgo(1) },
    ]
    expect(
      supersedeProjectUpdateMessages(
        recent,
        [projectUpdateChange.milestoneDates(name, { ...period, endDate: '2026-10-20' })],
        notBefore,
      ).deleteIds,
    ).toEqual(['m1'])
  })
})

describe('projectUpdateChangeKind', () => {
  test('組み立てた文はすべて項目として読み戻せる', () => {
    const period = { startDate: '2026-10-17', endDate: '2026-10-18', startTime: '10:00:00', endTime: null }
    expect([
      status('計画中'),
      dates(null, '2026-10-18'),
      projectUpdateChange.description(),
      projectUpdateChange.title('夏合宿'),
      projectUpdateChange.location('上高地'),
      projectUpdateChange.location(null),
      projectUpdateChange.archived(true),
      projectUpdateChange.archived(false),
      projectUpdateChange.milestoneAdded('下見'),
      projectUpdateChange.milestoneDates('下見', period),
      projectUpdateChange.milestoneCompleted('下見', true),
      projectUpdateChange.milestoneCompleted('下見', false),
      projectUpdateChange.galleryAdded(),
    ].map(projectUpdateChangeKind)).toEqual([
      'status', 'dates', 'description', 'title', 'location', 'location', 'archived', 'archived',
      'milestone-added:下見', 'milestone-dates:下見', 'milestone-completed:下見', 'milestone-completed:下見',
      'gallery',
    ])
    expect(projectUpdateChange.milestoneDates('下見', period)).toBe(
      'マイルストーン「下見」の期間を 2026-10-17 10:00 〜 2026-10-18 に変更しました',
    )
  })

  test('別のマイルストーンの期日変更は、同じ項目として扱わない', () => {
    const period = { startDate: '2026-10-17', endDate: null, startTime: null, endTime: null }
    const recent = [
      { id: 'm2', messageType: 'system', content: buildProjectUpdateMessage('山田', [projectUpdateChange.milestoneDates('本番', period)]), createdAt: minutesAgo(1) },
      { id: 'm1', messageType: 'system', content: buildProjectUpdateMessage('山田', [projectUpdateChange.milestoneDates('下見', period)]), createdAt: minutesAgo(2) },
    ]
    expect(
      supersedeProjectUpdateMessages(recent, [projectUpdateChange.milestoneDates('下見', period)], notBefore).deleteIds,
    ).toEqual(['m1'])
  })
})
