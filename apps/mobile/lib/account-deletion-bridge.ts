// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import AsyncStorage from '@react-native-async-storage/async-storage'

export const ACCOUNT_DELETED_LOGIN_ROUTE = '/(auth)/login?accountDeleted=1' as const

export async function finishNativeAccountDeletion(
  userId: string | null,
  signOut: () => Promise<unknown>,
  navigateToLogin: () => void,
): Promise<void> {
  try {
    if (userId) {
      await AsyncStorage.removeItem(`cairn:offline-message-queue:v1:${userId}`)
    }
    await signOut()
  } catch {
    // AuthユーザーはWeb側ですでに削除済みのため、リモートsignOutの失敗は無視する。
  } finally {
    // Authユーザーが既に消えてsignOutが失敗しても、削除済みセッションの画面へ戻さない。
    navigateToLogin()
  }
}
