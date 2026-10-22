// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 投票カードとモーダルの組み立て（純粋な関数）。Block Kit のサブセットだけを使い、Cairn の受理判定を通る形にする。
// 選択肢や質問は利用者の入力なので、mrkdwn の書式として解釈させないよう plain_text で出す。
// 決まった文言は英語をキーにして translate で表示言語にする。カードはチャンネルの全員に同じものが出るので作成した人の言語、
// モーダルと入力の誤りは操作した人の言語（cairn.locale）で出す

import { translate, type AppLocale } from '@cairn/shared'

export type PollForRender = {
  id: string
  question: string
  allowMultiple: boolean
  status: 'pending_post' | 'posted' | 'closed' | 'post_failed'
  /** カードの文言の言語（作成した人の表示言語） */
  locale: AppLocale
  options: Array<{ id: string; label: string; position: number }>
  votes: Array<{ optionId: string; userId: string }>
}

const BAR_CELLS = 10
// context の文字数上限（3000）に収める。多いときは「ほか N 人」にする
const MAX_VOTERS_SHOWN = 30

function bar(count: number, total: number): string {
  const filled = total === 0 ? 0 : Math.round((count / total) * BAR_CELLS)
  return '▓'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function renderPollCard(poll: PollForRender): { text: string; blocks: unknown[] } {
  const t = (message: string, values?: Record<string, string | number>) => translate(poll.locale, message, values)
  const closed = poll.status === 'closed'
  const voters = new Set(poll.votes.map((vote) => vote.userId))
  const options = [...poll.options].sort((a, b) => a.position - b.position)
  const blocks: unknown[] = [
    { type: 'header', block_id: 'question', text: { type: 'plain_text', text: truncate(poll.question, 150) } },
    {
      type: 'context',
      block_id: 'meta',
      elements: [
        {
          type: 'plain_text',
          text: [poll.allowMultiple ? t('Multiple choice') : t('Single choice'), t('{count} voted', { count: voters.size }), ...(closed ? [t('Poll closed')] : [])].join(' ・ '),
        },
      ],
    },
  ]
  for (const option of options) {
    const voterIds = [...new Set(poll.votes.filter((vote) => vote.optionId === option.id).map((vote) => vote.userId))]
    blocks.push({
      type: 'section',
      block_id: `option-${option.position}`,
      text: { type: 'plain_text', text: truncate(option.label, 2000) },
      ...(closed ? {} : { accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: t('Vote') }, value: `option:${option.id}` } }),
    })
    const shown = voterIds.slice(0, MAX_VOTERS_SHOWN).map((id) => `<@${id}>`).join(' ')
    const rest = voterIds.length > MAX_VOTERS_SHOWN ? ` ${t('and {count} more', { count: voterIds.length - MAX_VOTERS_SHOWN })}` : ''
    blocks.push({
      type: 'context',
      block_id: `votes-${option.position}`,
      elements: [{ type: 'mrkdwn', text: `\`${bar(voterIds.length, voters.size)}\` ${t('{count} votes', { count: voterIds.length })}${shown ? ` ・ ${shown}${rest}` : ''}` }],
    })
  }
  if (!closed) {
    blocks.push({
      type: 'actions',
      block_id: 'controls',
      elements: [
        { type: 'button', action_id: 'clear-vote', text: { type: 'plain_text', text: t('Remove my vote') } },
        {
          type: 'button',
          action_id: 'close',
          style: 'danger',
          text: { type: 'plain_text', text: t('Close poll') },
          confirm: {
            title: { type: 'plain_text', text: t('Close this poll?') },
            text: { type: 'plain_text', text: t('Once closed, no one can vote.') },
            confirm: { type: 'plain_text', text: t('Close poll') },
            deny: { type: 'plain_text', text: t('Keep open') },
            style: 'danger',
          },
        },
      ],
    })
  }
  return { text: t('Poll: {question}', { question: truncate(poll.question, 200) }), blocks }
}

export const CREATE_POLL_CALLBACK_ID = 'create-poll'
export const POLL_OPTION_LIMITS = { min: 2, max: 10, labelMax: 100 } as const

export function createPollModal(channelId: string, locale: AppLocale) {
  const t = (message: string, values?: Record<string, string | number>) => translate(locale, message, values)
  return {
    type: 'modal',
    callback_id: CREATE_POLL_CALLBACK_ID,
    private_metadata: JSON.stringify({ channelId }),
    title: { type: 'plain_text', text: t('Create a poll') },
    submit: { type: 'plain_text', text: t('Create') },
    close: { type: 'plain_text', text: t('Cancel') },
    blocks: [
      { type: 'input', block_id: 'question', label: { type: 'plain_text', text: t('Question') }, element: { type: 'plain_text_input', action_id: 'value', max_length: 150 } },
      {
        type: 'input',
        block_id: 'options',
        label: { type: 'plain_text', text: t('Options (one per line)') },
        hint: { type: 'plain_text', text: t('{min} to {max} options', { min: POLL_OPTION_LIMITS.min, max: POLL_OPTION_LIMITS.max }) },
        element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      },
      {
        type: 'input',
        block_id: 'mode',
        optional: true,
        label: { type: 'plain_text', text: t('How to choose') },
        element: {
          type: 'static_select',
          action_id: 'value',
          options: [
            { text: { type: 'plain_text', text: t('Only one') }, value: 'single' },
            { text: { type: 'plain_text', text: t('More than one') }, value: 'multiple' },
          ],
          initial_option: { text: { type: 'plain_text', text: t('Only one') }, value: 'single' },
        },
      },
    ],
  }
}

/** 作成した人以外が締め切ろうとしたときに見せるモーダル（カードは全員に同じで、押した本人にだけ知らせる手段がほかにないため） */
export function onlyCreatorCanCloseModal(locale: AppLocale) {
  return {
    type: 'modal',
    title: { type: 'plain_text', text: translate(locale, "Can't close this poll") },
    close: { type: 'plain_text', text: translate(locale, 'Close') },
    blocks: [{ type: 'section', text: { type: 'plain_text', text: translate(locale, 'Only the person who created the poll can close it.') } }],
  }
}

export type ParsedPollInput = { ok: true; question: string; options: string[]; allowMultiple: boolean } | { ok: false; errors: Record<string, string> }

type StateValues = Record<string, Record<string, { value?: string | null; selected_option?: { value: string } | null }>>

/** モーダルの送信値を検証する。エラーは入力欄ごとの文言（アプリの文言としてそのまま表示されるので、操作した人の言語で作る） */
export function parsePollSubmission(values: StateValues, locale: AppLocale): ParsedPollInput {
  const t = (message: string, values?: Record<string, string | number>) => translate(locale, message, values)
  const question = (values['question']?.['value']?.value ?? '').trim()
  const lines = (values['options']?.['value']?.value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const options = [...new Set(lines)]
  const errors: Record<string, string> = {}
  if (!question) errors['question'] = t('Enter a question')
  if (options.length < POLL_OPTION_LIMITS.min) errors['options'] = t('Enter at least {min} options (duplicates are merged)', { min: POLL_OPTION_LIMITS.min })
  else if (options.length > POLL_OPTION_LIMITS.max) errors['options'] = t('You can add up to {max} options', { max: POLL_OPTION_LIMITS.max })
  else if (options.some((option) => option.length > POLL_OPTION_LIMITS.labelMax)) errors['options'] = t('Each option can be up to {max} characters', { max: POLL_OPTION_LIMITS.labelMax })
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, question, options, allowMultiple: values['mode']?.['value']?.selected_option?.value === 'multiple' }
}
