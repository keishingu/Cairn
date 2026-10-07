// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  buildProjectUpdateMessage,
  projectUpdateChange,
  projectUpdateKey,
  supersededProjectUpdateMessageIds,
  type ProjectUpdateChange,
} from './project-update-message'

const now = new Date('2026-10-07T12:00:00Z')
const notBefore = new Date('2026-10-06T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

const { dates, status } = projectUpdateChange
const newDates = [dates('2026-10-20', '2026-10-21')]
const period = { startDate: '2026-10-17', endDate: '2026-10-18', startTime: '10:00:00', endTime: null }
const milestone = (id: string, title: string) => ({ id, title, ...period })

/** 保存済みの通知。DB では本文とは別に kind / milestoneId を持つ */
const stored = (id: string, minutes: number, change: ProjectUpdateChange) => ({
  id,
  messageType: 'system',
  createdAt: minutesAgo(minutes),
  update: { kind: change.kind, milestoneId: change.milestoneId ?? null },
})

describe('上書きされる更新通知の選択（supersededProjectUpdateMessageIds）', () => {
  test('同じ項目を続けて変更したら、前の通知をすべて消して最後の1件だけ残す', () => {
    const recent = [
      stored('m3', 1, dates('2026-10-18', '2026-10-17')),
      stored('m2', 2, dates('2026-10-17', '2026-10-17')),
      stored('m1', 3, dates('2026-10-18', '2026-10-17')),
    ]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual(['m3', 'm2', 'm1'])
  })

  test('別の項目の通知は残し、その先にある同じ項目の通知は消す', () => {
    const recent = [stored('m2', 1, status('実施待ち')), stored('m1', 2, dates('2026-10-17', '2026-10-17'))]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual(['m1'])
  })

  test('間に誰かの投稿があれば、それより前の通知は会話の記録として残す', () => {
    const recent = [
      stored('m3', 1, dates('2026-10-18', '2026-10-19')),
      { id: 'm2', messageType: 'text', createdAt: minutesAgo(2), update: null },
      stored('m1', 3, dates('2026-10-17', '2026-10-17')),
    ]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual(['m3'])
  })

  test('24時間より前の通知は残す', () => {
    const recent = [stored('m1', 25 * 60, dates('2026-10-17', '2026-10-17'))]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual([])
  })

  test('項目を持たない system メッセージ（更新通知以外・この仕組みより前の通知）には手を付けず、そこで止まる', () => {
    const recent = [
      { id: 'm2', messageType: 'system', createdAt: minutesAgo(1), update: null },
      stored('m1', 2, dates('2026-10-17', '2026-10-17')),
    ]
    expect(supersededProjectUpdateMessageIds(recent, newDates, notBefore)).toEqual([])
  })

  test('同名でも別のマイルストーンの通知は消さない', () => {
    const recent = [
      stored('m2', 1, projectUpdateChange.milestoneDates(milestone('ms-b', '下見'))),
      stored('m1', 2, projectUpdateChange.milestoneDates(milestone('ms-a', '下見'))),
    ]
    expect(
      supersededProjectUpdateMessageIds(
        recent,
        [projectUpdateChange.milestoneDates(milestone('ms-a', '下見'))],
        notBefore,
      ),
    ).toEqual(['m1'])
  })

  test('マイルストーンの名前を変えた後も、同じマイルストーンの通知として集約する', () => {
    const recent = [stored('m1', 1, projectUpdateChange.milestoneDates(milestone('ms-a', '下見')))]
    expect(
      supersededProjectUpdateMessageIds(
        recent,
        [projectUpdateChange.milestoneDates(milestone('ms-a', '現地確認'))],
        notBefore,
      ),
    ).toEqual(['m1'])
  })

  test('同じマイルストーンでも、期間の変更で完了の通知は消さない', () => {
    const recent = [stored('m1', 1, projectUpdateChange.milestoneCompleted(milestone('ms-a', '下見'), true))]
    expect(
      supersededProjectUpdateMessageIds(
        recent,
        [projectUpdateChange.milestoneDates(milestone('ms-a', '下見'))],
        notBefore,
      ),
    ).toEqual([])
  })

  test('21件以上続いた通知の先にある同じ項目も消す', () => {
    const others = Array.from({ length: 21 }, (_, index) =>
      stored(`other-${index}`, index + 1, projectUpdateChange.milestoneDates(milestone(`ms-${index}`, `M${index}`))),
    )
    const recent = [...others, stored('first', 30, projectUpdateChange.milestoneDates(milestone('ms-first', '最初')))]
    expect(
      supersededProjectUpdateMessageIds(
        recent,
        [projectUpdateChange.milestoneDates(milestone('ms-first', '最初'))],
        notBefore,
      ),
    ).toEqual(['first'])
  })
})

describe('更新通知の組み立て（projectUpdateChange）', () => {
  test('項目は本文ではなく kind と milestoneId で決まり、名前に何が入っていても変わらない', () => {
    expect(projectUpdateKey(projectUpdateChange.title('春 / 期間を 夏合宿'))).toBe('title')
    expect(projectUpdateKey(projectUpdateChange.location('期間を A 〜 B に変更しました'))).toBe('location')
    expect(projectUpdateKey(projectUpdateChange.milestoneDates(milestone('ms-a', '設計 / 実装')))).toBe(
      'milestone_dates:ms-a',
    )
    expect(projectUpdateKey(projectUpdateChange.milestoneAdded(milestone('ms-a', '下見')))).toBe('milestone_added:ms-a')
    expect(projectUpdateKey(projectUpdateChange.galleryAdded())).toBe('gallery')
  })

  test('通知の本文を組み立てる', () => {
    expect(buildProjectUpdateMessage('山田', projectUpdateChange.milestoneDates(milestone('ms-a', '下見')))).toBe(
      '山田さんがプロジェクトを更新しました：マイルストーン「下見」の期間を 2026-10-17 10:00 〜 2026-10-18 に変更しました',
    )
    expect(buildProjectUpdateMessage('山田', projectUpdateChange.location(null))).toBe(
      '山田さんがプロジェクトを更新しました：場所を未設定にしました',
    )
    expect(buildProjectUpdateMessage('山田', dates(null, '2026-10-18'))).toBe(
      '山田さんがプロジェクトを更新しました：期間を 未設定 〜 2026-10-18 に変更しました',
    )
  })
})
