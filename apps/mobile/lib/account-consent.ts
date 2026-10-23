// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const ACCOUNT_CONSENT_MESSAGE =
  'By creating an account, you agree to the {terms} and {privacy}.'

export const CONSENT_LINK_LABELS = {
  terms: 'Terms',
  privacy: 'Privacy policy',
} as const

const CONSENT_URLS = {
  terms: 'https://oss-cairn.com/terms',
  privacy: 'https://oss-cairn.com/privacy',
} as const

export type ConsentSlot = keyof typeof CONSENT_LINK_LABELS

export type ConsentPiece =
  | { kind: 'text'; text: string }
  | { kind: 'link'; slot: ConsentSlot }

export function accountConsentUrl(slot: ConsentSlot): string {
  return CONSENT_URLS[slot]
}

/** 翻訳後の1文を、文の並びを崩さずリンク槽と地の文に分ける。 */
export function accountConsentPieces(sentence: string): ConsentPiece[] {
  const pieces: ConsentPiece[] = []
  for (const part of sentence.split(/\{(terms|privacy)\}/)) {
    if (part === 'terms' || part === 'privacy') {
      pieces.push({ kind: 'link', slot: part })
    } else if (part.length > 0) {
      pieces.push({ kind: 'text', text: part })
    }
  }
  return pieces
}
