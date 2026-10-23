import type { AppleAuthenticationFullName } from 'expo-apple-authentication'

type AppleAuthenticationError = { code?: unknown }

// Appleは氏名を初回認可時だけ返す。空の値は保存せず、既存プロフィールを守る。
export function getAppleDisplayName(fullName: AppleAuthenticationFullName | null): string | null {
  if (!fullName) return null

  const displayName = [fullName.givenName, fullName.middleName, fullName.familyName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')

  return displayName || null
}

export function isAppleAuthenticationCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as AppleAuthenticationError).code === 'ERR_REQUEST_CANCELED'
  )
}
