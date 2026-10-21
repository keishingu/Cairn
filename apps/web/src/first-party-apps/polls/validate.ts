// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { unsafeMessageError } from '@/lib/safety/message-filter'
import { POLL_OPTION_LIMITS } from './render'

/** 投票の質問の上限（モーダルの入力欄・カードの見出しと同じ） */
export const POLL_QUESTION_MAX = 150

/**
 * 投票を作る前の確認。モーダルからでも、定期ジョブ・AI（createPoll）からでも同じ規則で確かめる。
 * Bot API は投稿の安全フィルタにかけるので、同じフィルタを先に通し、作った後で投稿だけが失敗する（作り直せない）ことを防ぐ。
 * 問題があれば欄（question / options）ごとの理由を返す
 */
export function pollInputErrors(question: string, options: string[]): Record<'question' | 'options', string> | null {
  const errors: Partial<Record<'question' | 'options', string>> = {}
  if (!question.trim()) errors.question = '質問を入力してください'
  else if (question.length > POLL_QUESTION_MAX) errors.question = `質問は${POLL_QUESTION_MAX}文字までです`
  if (new Set(options).size !== options.length) errors.options = '選択肢が重複しています'
  else if (options.length < POLL_OPTION_LIMITS.min) errors.options = `選択肢を${POLL_OPTION_LIMITS.min}つ以上入力してください（重複は1つにまとめます）`
  else if (options.length > POLL_OPTION_LIMITS.max) errors.options = `選択肢は${POLL_OPTION_LIMITS.max}個までです`
  else if (options.some((option) => !option.trim() || option.length > POLL_OPTION_LIMITS.labelMax)) errors.options = `選択肢は1つ${POLL_OPTION_LIMITS.labelMax}文字までです`
  if (!errors.question) {
    const unsafe = unsafeMessageError(question)
    if (unsafe) errors.question = unsafe
  }
  if (!errors.options) {
    const unsafe = unsafeMessageError(options.join('\n')) ?? (errors.question ? null : unsafeMessageError([question, ...options].join('\n')))
    if (unsafe) errors.options = unsafe
  }
  return Object.keys(errors).length > 0 ? (errors as Record<'question' | 'options', string>) : null
}
