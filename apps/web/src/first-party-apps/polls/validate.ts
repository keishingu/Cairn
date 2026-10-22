// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate, type AppLocale } from '@cairn/shared'
import { unsafeMessageError } from '@/lib/safety/message-filter'
import { POLL_OPTION_LIMITS } from './render'

/** 投票の質問の上限（モーダルの入力欄・カードの見出しと同じ） */
export const POLL_QUESTION_MAX = 150

/**
 * 投票を作る前の確認。モーダルからでも、定期ジョブ・AI（createPoll）からでも同じ規則で確かめる。
 * Bot API は投稿の安全フィルタにかけるので、同じフィルタを先に通し、作った後で投稿だけが失敗する（作り直せない）ことを防ぐ。
 * 問題があれば欄（question / options）ごとの理由を返す
 */
export function pollInputErrors(question: string, options: string[], locale: AppLocale): Record<'question' | 'options', string> | null {
  const t = (message: string, values?: Record<string, string | number>) => translate(locale, message, values)
  // 安全フィルタの文言は日本語固定なので、判定だけを使って表示言語の文言にする
  const unsafeMessage = t('This content cannot be posted for safety reasons. Please revise the wording.')
  const errors: Partial<Record<'question' | 'options', string>> = {}
  if (!question.trim()) errors.question = t('Enter a question')
  else if (question.length > POLL_QUESTION_MAX) errors.question = t('The question can be up to {max} characters', { max: POLL_QUESTION_MAX })
  if (new Set(options).size !== options.length) errors.options = t('Options are duplicated')
  else if (options.length < POLL_OPTION_LIMITS.min) errors.options = t('Enter at least {min} options (duplicates are merged)', { min: POLL_OPTION_LIMITS.min })
  else if (options.length > POLL_OPTION_LIMITS.max) errors.options = t('You can add up to {max} options', { max: POLL_OPTION_LIMITS.max })
  else if (options.some((option) => !option.trim() || option.length > POLL_OPTION_LIMITS.labelMax)) errors.options = t('Each option can be up to {max} characters', { max: POLL_OPTION_LIMITS.labelMax })
  if (!errors.question && unsafeMessageError(question)) errors.question = unsafeMessage
  if (!errors.options) {
    const unsafe = unsafeMessageError(options.join('\n')) ?? (errors.question ? null : unsafeMessageError([question, ...options].join('\n')))
    if (unsafe) errors.options = unsafeMessage
  }
  return Object.keys(errors).length > 0 ? (errors as Record<'question' | 'options', string>) : null
}
