// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  buildProjectUpdateMessage,
  projectUpdateChange,
  projectUpdateChangeKind,
  projectUpdateMessageKind,
  supersededProjectUpdateMessageIds,
} from './project-update-message'

const now = new Date('2026-10-07T12:00:00Z')
const notBefore = new Date('2026-10-06T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

const { dates, status } = projectUpdateChange
const newDates = [dates('2026-10-20', '2026-10-21')]
const system = (id: string, minutes: number, change: string) => ({
  id,
  messageType: 'system',
  content: buildProjectUpdateMessage('山田', change),
  createdAt: minutesAgo(minutes),
})

describe('supersededProjectUpdateMessageIds', () => {
  test('同じ項目を続けて変更したら、前の通知をすべて消して最後の1件だけ残す', () => {
    const recent = [
      system('m3', 1, dates('2026-10-18', '2026-10-17')),
      system('m2', 2, dates('2026-10-17', '2026-10-17')),
      system('m1', 3, dates('2026-10-18', '2026-10-17')),
    ]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual(['m3', 'm2', 'm1'])
  })

  test('別の項目の通知は残し、その先にある同じ項目の通知は消す', () => {
    const recent = [system('m2', 1, status('実施待ち')), system('m1', 2, dates('2026-10-17', '2026-10-17'))]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual(['m1'])
  })

  test('間に誰かの投稿があれば、それより前の通知は会話の記録として残す', () => {
    const recent = [
      system('m3', 1, dates('2026-10-18', '2026-10-19')),
      { id: 'm2', messageType: 'text', content: '日程了解です', createdAt: minutesAgo(2) },
      system('m1', 3, dates('2026-10-17', '2026-10-17')),
    ]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual(['m3'])
  })

  test('24時間より前の通知は残す', () => {
    const recent = [system('m1', 25 * 60, dates('2026-10-17', '2026-10-17'))]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual([])
  })

  test('プロジェクト更新以外の system メッセージには手を付けない', () => {
    const recent = [{ id: 'm1', messageType: 'system', content: '期間を 過ぎました', createdAt: minutesAgo(1) }]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual([])
  })

  test('別のマイルストーンの期日変更は、同じ項目として扱わない', () => {
    const period = { startDate: '2026-10-17', endDate: null, startTime: null, endTime: null }
    const recent = [
      system('m2', 1, projectUpdateChange.milestoneDates('本番', period)),
      system('m1', 2, projectUpdateChange.milestoneDates('下見', period)),
    ]
    expect(
      supersededProjectUpdateMessageIds(recent, [projectUpdateChange.milestoneDates('下見', period)], notBefore),
    ).toEqual(['m1'])
  })

  test('21件以上続いた通知の先にある同じ項目も消す', () => {
    const period = { startDate: '2026-10-17', endDate: null, startTime: null, endTime: null }
    const others = Array.from({ length: 21 }, (_, index) =>
      system(`other-${index}`, index + 1, projectUpdateChange.milestoneDates(`M${index}`, period)),
    )
    const recent = [...others, system('first', 30, projectUpdateChange.milestoneDates('最初', period))]
    expect(
      supersededProjectUpdateMessageIds(recent, [projectUpdateChange.milestoneDates('最初', period)], notBefore),
    ).toEqual(['first'])
  })
})

describe('projectUpdateChangeKind', () => {
  const period = { startDate: '2026-10-17', endDate: '2026-10-18', startTime: '10:00:00', endTime: null }

  test('組み立てた文はすべて項目として読み戻せる', () => {
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

  test('名前の中身が別の項目や区切りに見えても、名前として扱う', () => {
    expect(projectUpdateChangeKind(projectUpdateChange.title('春 / 期間を 夏合宿'))).toBe('title')
    expect(projectUpdateChangeKind(projectUpdateChange.title('場所を「山」に変更しました'))).toBe('title')
    expect(projectUpdateChangeKind(projectUpdateChange.location('期間を A 〜 B に変更しました'))).toBe('location')
    expect(projectUpdateChangeKind(projectUpdateChange.milestoneDates('設計 / 実装', period))).toBe(
      'milestone-dates:設計 / 実装',
    )
    expect(projectUpdateChangeKind(projectUpdateChange.milestoneCompleted('設計 / 実装', true))).toBe(
      'milestone-completed:設計 / 実装',
    )
  })

  test('項目に見える名前のプロジェクト名変更を、期間の通知で消さない', () => {
    const recent = [system('m1', 1, projectUpdateChange.title('春 / 期間を 夏合宿'))]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual([])
  })
})

describe('projectUpdateMessageKind', () => {
  test('通知の本文から項目を読み、通知でない本文は null にする', () => {
    expect(projectUpdateMessageKind(buildProjectUpdateMessage('山田', status('計画中')))).toBe('status')
    expect(projectUpdateMessageKind('山田さんがプロジェクトを更新しました：よく分からない文')).toBeNull()
    expect(projectUpdateMessageKind('日程了解です')).toBeNull()
  })
})
