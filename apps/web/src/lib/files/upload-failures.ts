// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 複数ファイルを並行アップロードした結果から、失敗したものを「ファイル名: 理由」の一覧にする。
 * サーバーの汎用エラー（「アップロードに失敗しました」など）が並んでもどのファイルか分かるよう、
 * 理由の文言に関係なく必ずファイル名を先頭に付ける。results は files と同じ順序であること。
 */
export function describeUploadFailures(
  files: readonly File[],
  results: readonly PromiseSettledResult<unknown>[],
  fallbackMessage: string,
): string[] {
  return results.flatMap((result, i) => {
    if (result.status !== 'rejected') return []
    const message = result.reason instanceof Error && result.reason.message ? result.reason.message : fallbackMessage
    const name = files[i]?.name
    return [name ? `${name}: ${message}` : message]
  })
}
