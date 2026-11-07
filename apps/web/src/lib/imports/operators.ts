// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 外部チャットの取り込みを使える Cairn 運営者か。
 * 取り込みは移行支援をしながら運営者が実行する前提のため、環境変数 `IMPORT_OPERATOR_USER_IDS`
 * （カンマ区切りのユーザー ID）に載っている人だけに許可する。未設定なら誰も使えない。
 * メールアドレスではなくユーザー ID で判定するのは、getAuthContext() が JWT だけで本人を判定しており、
 * 追加の照会なしに確実に比べられるのが ID だけのため
 */
export function isImportOperator(userId: string, operatorIds: string | undefined = process.env['IMPORT_OPERATOR_USER_IDS']): boolean {
  if (!operatorIds) return false
  return operatorIds.split(',').map(id => id.trim()).filter(Boolean).includes(userId)
}
