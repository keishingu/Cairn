// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const ACCOUNT_DELETED_LOGIN_ROUTE = '/(auth)/login?accountDeleted=1' as const

export async function finishNativeAccountDeletion(
  signOut: () => Promise<unknown>,
  navigateToLogin: () => void,
): Promise<void> {
  try {
    await signOut()
  } catch {
    // AuthユーザーはWeb側ですでに削除済みのため、リモートsignOutの失敗は無視する。
  } finally {
    // Authユーザーが既に消えてsignOutが失敗しても、削除済みセッションの画面へ戻さない。
    navigateToLogin()
  }
}
