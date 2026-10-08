// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// プロジェクト更新をチャンネルへ知らせる system メッセージの組み立てと、古い通知の整理。
// 同じ項目を続けて直すと「期間を…に変更しました」が何行も並び、どれが最新か読み取りにくくなるため、
// 新しい通知と同じ項目の通知が直前に並んでいれば、古いほうを消す。
// 「どの項目の通知か」は本文とは別に message_project_updates へ保存する。本文は表示用の文で、
// 名前や表示名に任意の文字列が入るため、本文から項目を読み戻すと別の項目と取り違える。

/** これより前の通知は、その時点の決定の記録として残す */
export const PROJECT_UPDATE_SUPERSEDE_WINDOW_MS = 24 * 60 * 60 * 1000

const UNSET = '未設定'

export type ProjectUpdateKind =
  | 'status'
  | 'dates'
  | 'description'
  | 'title'
  | 'location'
  | 'archived'
  | 'gallery'
  | 'milestone_added'
  | 'milestone_dates'
  | 'milestone_completed'

export interface ProjectUpdateChange {
  kind: ProjectUpdateKind
  /** マイルストーンの通知だけ持つ。同名のマイルストーンを別の項目として扱うため、名前ではなく ID で区別する */
  milestoneId?: string
  /** 通知に表示する文 */
  text: string
}

function formatPeriod(start: string | null, end: string | null): string {
  return `${start ?? UNSET} 〜 ${end ?? UNSET}`
}

function formatDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null
  return time ? `${date} ${time.slice(0, 5)}` : date
}

type MilestoneRef = { id: string; title: string }

export const projectUpdateChange = {
  status: (name: string): ProjectUpdateChange => ({ kind: 'status', text: `ステータスを「${name}」に変更しました` }),
  dates: (start: string | null, end: string | null): ProjectUpdateChange => ({
    kind: 'dates',
    text: `期間を ${formatPeriod(start, end)} に変更しました`,
  }),
  description: (): ProjectUpdateChange => ({ kind: 'description', text: '概要を更新しました' }),
  title: (title: string): ProjectUpdateChange => ({ kind: 'title', text: `プロジェクト名を「${title}」に変更しました` }),
  location: (location: string | null): ProjectUpdateChange => ({
    kind: 'location',
    text: location ? `場所を「${location}」に変更しました` : `場所を${UNSET}にしました`,
  }),
  archived: (archived: boolean): ProjectUpdateChange => ({
    kind: 'archived',
    text: archived ? 'プロジェクトをアーカイブしました' : 'プロジェクトをアーカイブから復元しました',
  }),
  milestoneAdded: (milestone: MilestoneRef): ProjectUpdateChange => ({
    kind: 'milestone_added',
    milestoneId: milestone.id,
    text: `マイルストーン「${milestone.title}」を追加しました`,
  }),
  milestoneDates: (
    milestone: MilestoneRef & {
      startDate: string | null
      endDate: string | null
      startTime: string | null
      endTime: string | null
    },
  ): ProjectUpdateChange => ({
    kind: 'milestone_dates',
    milestoneId: milestone.id,
    text: `マイルストーン「${milestone.title}」の期間を ${formatPeriod(
      formatDateTime(milestone.startDate, milestone.startTime),
      formatDateTime(milestone.endDate, milestone.endTime),
    )} に変更しました`,
  }),
  milestoneCompleted: (milestone: MilestoneRef, completed: boolean): ProjectUpdateChange => ({
    kind: 'milestone_completed',
    milestoneId: milestone.id,
    text: completed
      ? `マイルストーン「${milestone.title}」を完了にしました`
      : `マイルストーン「${milestone.title}」を未完了に戻しました`,
  }),
  // 写真は1枚ずつ確定するため枚数は入れない。続けて追加した分は1件の通知にまとまる
  galleryAdded: (): ProjectUpdateChange => ({ kind: 'gallery', text: 'ギャラリーに写真を追加しました' }),
}

/** 同じ値どうしが「同じ項目」。マイルストーンは ID ごとに別の項目になる */
export function projectUpdateKey(update: { kind: string; milestoneId?: string | null }): string {
  return update.milestoneId ? `${update.kind}:${update.milestoneId}` : update.kind
}

// 変更1つにつき通知1件。1回の保存で複数の項目が変わったら、項目ごとに別の通知にする
export function buildProjectUpdateMessage(actorName: string, change: ProjectUpdateChange): string {
  return `${actorName}さんがプロジェクトを更新しました：${change.text}`
}

/**
 * 新しい通知と同じ項目の通知を、直前に並んでいる通知の中から選ぶ（呼び出し側で消す）。
 * `recentMessages` は新しい順で、`update` は message_project_updates の行（無ければ null）。
 * 通知以外の投稿や `notBefore` より古い通知に当たったら、そこから前は会話の流れの一部として手を付けない。
 */
export function supersededProjectUpdateMessageIds(
  recentMessages: ReadonlyArray<{
    id: string
    messageType: string
    createdAt: Date
    update: { kind: string; milestoneId: string | null } | null
  }>,
  newChanges: ReadonlyArray<ProjectUpdateChange>,
  notBefore: Date,
): string[] {
  const newKeys = new Set(newChanges.map(projectUpdateKey))
  const ids: string[] = []
  for (const message of recentMessages) {
    if (message.messageType !== 'system' || message.createdAt < notBefore || !message.update) break
    if (newKeys.has(projectUpdateKey(message.update))) ids.push(message.id)
  }
  return ids
}
