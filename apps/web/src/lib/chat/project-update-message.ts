// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// プロジェクト更新をチャンネルへ知らせる system メッセージの組み立てと、古い通知の整理。
// 同じ項目を続けて直すと「期間を…に変更しました」が何行も並び、どれが最新か読み取りにくくなるため、
// 新しい通知が同じ項目を含むときは、直前に並んでいる通知からその項目を取り除く。
// メッセージに構造化データは持たせていないので、ここで組み立てた文をここで読み戻して項目を判定する。
// 文言を足す時は、下の projectUpdateChange と CHANGE_PATTERNS を必ず対で直すこと。

/** これより前の通知は、その時点の決定の記録として残す */
export const PROJECT_UPDATE_SUPERSEDE_WINDOW_MS = 24 * 60 * 60 * 1000

const HEADER = 'さんがプロジェクトを更新しました：'
const SEPARATOR = ' / '
const UNSET = '未設定'

function formatPeriod(start: string | null, end: string | null): string {
  return `${start ?? UNSET} 〜 ${end ?? UNSET}`
}

function formatDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null
  return time ? `${date} ${time.slice(0, 5)}` : date
}

export const projectUpdateChange = {
  status: (name: string) => `ステータスを「${name}」に変更しました`,
  dates: (start: string | null, end: string | null) => `期間を ${formatPeriod(start, end)} に変更しました`,
  description: () => '概要を更新しました',
  title: (title: string) => `プロジェクト名を「${title}」に変更しました`,
  location: (location: string | null) => (location ? `場所を「${location}」に変更しました` : `場所を${UNSET}にしました`),
  archived: (archived: boolean) => (archived ? 'プロジェクトをアーカイブしました' : 'プロジェクトをアーカイブから復元しました'),
  milestoneAdded: (title: string) => `マイルストーン「${title}」を追加しました`,
  milestoneDates: (
    title: string,
    period: { startDate: string | null; endDate: string | null; startTime: string | null; endTime: string | null },
  ) =>
    `マイルストーン「${title}」の期間を ${formatPeriod(
      formatDateTime(period.startDate, period.startTime),
      formatDateTime(period.endDate, period.endTime),
    )} に変更しました`,
  milestoneCompleted: (title: string, completed: boolean) =>
    completed ? `マイルストーン「${title}」を完了にしました` : `マイルストーン「${title}」を未完了に戻しました`,
  // 写真は1枚ずつ確定するため枚数は入れない。続けて追加した分は1件の通知にまとまる
  galleryAdded: () => 'ギャラリーに写真を追加しました',
}

// マイルストーンは名前ごとに別の項目として扱う（A の期日変更で B の通知を消さない）
const CHANGE_PATTERNS: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^ステータスを「/, () => 'status'],
  [/^期間を /, () => 'dates'],
  [/^概要を更新しました$/, () => 'description'],
  [/^プロジェクト名を「/, () => 'title'],
  [/^場所を/, () => 'location'],
  [/^プロジェクトをアーカイブ/, () => 'archived'],
  [/^ギャラリーに写真を追加しました$/, () => 'gallery'],
  [/^マイルストーン「(.+)」を追加しました$/, match => `milestone-added:${match[1]}`],
  [/^マイルストーン「(.+)」の期間を /, match => `milestone-dates:${match[1]}`],
  [/^マイルストーン「(.+)」を(?:完了にしました|未完了に戻しました)$/, match => `milestone-completed:${match[1]}`],
]

/** 同じ値を返す変更どうしが「同じ項目」。通知の文でなければ null */
export function projectUpdateChangeKind(text: string): string | null {
  for (const [pattern, toKind] of CHANGE_PATTERNS) {
    const match = pattern.exec(text)
    if (match) return toKind(match)
  }
  return null
}

export function buildProjectUpdateMessage(actorName: string, changes: ReadonlyArray<string>): string {
  return `${actorName}${HEADER}${changes.join(SEPARATOR)}`
}

// 項目の書き出し。名前に区切り文字（" / "）を含む項目を、分割された断片から組み立て直す手がかりにする
const CHANGE_START = /^(?:ステータスを「|期間を |概要を更新しました|プロジェクト名を「|場所を|プロジェクトをアーカイブ|ギャラリーに写真を|マイルストーン「)/

/** プロジェクト更新の通知でなければ null */
export function parseProjectUpdateMessage(content: string): { actorName: string; changes: string[] } | null {
  const headerIndex = content.indexOf(HEADER)
  if (headerIndex < 0) return null

  // プロジェクト名やマイルストーン名は " / " を含められるため、区切りで割っただけでは項目にならない。
  // 項目として読めるまで断片をつなぎ、書き出しでない断片は直前の項目の続きとして戻す
  const changes: string[] = []
  let pending: string | null = null
  for (const piece of content.slice(headerIndex + HEADER.length).split(SEPARATOR)) {
    if (pending !== null) {
      pending += `${SEPARATOR}${piece}`
      if (projectUpdateChangeKind(pending)) {
        changes.push(pending)
        pending = null
      }
      continue
    }
    if (projectUpdateChangeKind(piece)) {
      changes.push(piece)
    } else if (CHANGE_START.test(piece)) {
      pending = piece
    } else if (changes.length > 0) {
      changes[changes.length - 1] += `${SEPARATOR}${piece}`
    } else {
      return null
    }
  }
  // 最後まで項目として読めなかった断片が残るなら、通知の文ではない
  if (pending !== null) return null
  return { actorName: content.slice(0, headerIndex), changes }
}

/**
 * 新しい通知が上書きする項目を、直前に並んでいる通知から取り除く。
 * `recentMessages` は新しい順。通知以外の投稿や `notBefore` より古い通知に当たったら、
 * そこから前は会話の流れの一部として手を付けない。
 */
export function supersedeProjectUpdateMessages(
  recentMessages: ReadonlyArray<{ id: string; messageType: string; content: string; createdAt: Date }>,
  newChanges: ReadonlyArray<string>,
  notBefore: Date,
): { deleteIds: string[]; rewrites: { id: string; content: string }[] } {
  const newKinds = new Set(newChanges.map(projectUpdateChangeKind))
  const deleteIds: string[] = []
  const rewrites: { id: string; content: string }[] = []

  for (const message of recentMessages) {
    if (message.messageType !== 'system' || message.createdAt < notBefore) break
    const parsed = parseProjectUpdateMessage(message.content)
    if (!parsed) break

    const remaining = parsed.changes.filter(change => !newKinds.has(projectUpdateChangeKind(change)))
    if (remaining.length === parsed.changes.length) continue
    if (remaining.length === 0) deleteIds.push(message.id)
    else rewrites.push({ id: message.id, content: buildProjectUpdateMessage(parsed.actorName, remaining) })
  }
  return { deleteIds, rewrites }
}
