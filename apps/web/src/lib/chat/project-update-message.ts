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

// 文の先頭から末尾までで判定する。名前（プロジェクト名・マイルストーン名・場所）には何でも入れられるため、
// 書き出しだけで判定すると、名前の中身が別の項目に見えてしまう。
// マイルストーンは名前ごとに別の項目として扱う（A の期日変更で B の通知を消さない）。
// 同じプロジェクトに同名のマイルストーンが複数ある場合は区別できず、片方の更新でもう片方の直前の通知も消える。
// 通知の文にも名前しか出ないため読み手にも区別はつかないが、ID で分けるにはメッセージに構造化データが要る
const CHANGE_PATTERNS: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^ステータスを「[\s\S]*」に変更しました$/, () => 'status'],
  [/^期間を [\s\S]+ 〜 [\s\S]+ に変更しました$/, () => 'dates'],
  [/^概要を更新しました$/, () => 'description'],
  [/^プロジェクト名を「[\s\S]*」に変更しました$/, () => 'title'],
  [/^場所を(?:「[\s\S]*」に変更しました|未設定にしました)$/, () => 'location'],
  [/^プロジェクトをアーカイブ(?:しました|から復元しました)$/, () => 'archived'],
  [/^ギャラリーに写真を追加しました$/, () => 'gallery'],
  [/^マイルストーン「([\s\S]+)」を追加しました$/, match => `milestone-added:${match[1]}`],
  [/^マイルストーン「([\s\S]+)」の期間を [\s\S]+ 〜 [\s\S]+ に変更しました$/, match => `milestone-dates:${match[1]}`],
  [/^マイルストーン「([\s\S]+)」を(?:完了にしました|未完了に戻しました)$/, match => `milestone-completed:${match[1]}`],
]

/** 同じ値を返す変更どうしが「同じ項目」。通知の文でなければ null */
export function projectUpdateChangeKind(text: string): string | null {
  for (const [pattern, toKind] of CHANGE_PATTERNS) {
    const match = pattern.exec(text)
    if (match) return toKind(match)
  }
  return null
}

// 変更1つにつき通知1件。複数の変更を1つの文につなぐと、名前に区切りと同じ文字列が入った時に
// どこまでが名前か決められず、集約で別の項目を巻き込む
export function buildProjectUpdateMessage(actorName: string, change: string): string {
  return `${actorName}${HEADER}${change}`
}

/** 通知が表す項目。プロジェクト更新の通知でなければ null */
export function projectUpdateMessageKind(content: string): string | null {
  // 表示名にも見出しと同じ文字列を入れられるため、最初に見つかった位置を区切りと決めつけない。
  // 見出しの候補を順に試し、後ろが項目として読める位置を区切りとする
  let headerIndex = content.indexOf(HEADER)
  while (headerIndex >= 0) {
    const kind = projectUpdateChangeKind(content.slice(headerIndex + HEADER.length))
    if (kind) return kind
    headerIndex = content.indexOf(HEADER, headerIndex + 1)
  }
  return null
}

/**
 * 新しい通知と同じ項目の通知を、直前に並んでいる通知の中から選ぶ（呼び出し側で消す）。
 * `recentMessages` は新しい順。通知以外の投稿や `notBefore` より古い通知に当たったら、
 * そこから前は会話の流れの一部として手を付けない。
 */
export function supersededProjectUpdateMessageIds(
  recentMessages: ReadonlyArray<{ id: string; messageType: string; content: string; createdAt: Date }>,
  newChanges: ReadonlyArray<string>,
  notBefore: Date,
): string[] {
  const newKinds = new Set(newChanges.map(projectUpdateChangeKind))
  const ids: string[] = []
  for (const message of recentMessages) {
    if (message.messageType !== 'system' || message.createdAt < notBefore) break
    const kind = projectUpdateMessageKind(message.content)
    if (!kind) break
    if (newKinds.has(kind)) ids.push(message.id)
  }
  return ids
}
