// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 投票カードとモーダルの組み立て（純粋な関数）。Block Kit のサブセットだけを使い、Cairn の受理判定を通る形にする。
// 選択肢や質問は利用者の入力なので、mrkdwn の書式として解釈させないよう plain_text で出す

export type PollForRender = {
  id: string
  question: string
  allowMultiple: boolean
  status: 'pending_post' | 'posted' | 'closed'
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
          text: [poll.allowMultiple ? '複数選択' : '単一選択', `${voters.size}人が投票`, ...(closed ? ['締め切り済み'] : [])].join(' ・ '),
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
      ...(closed ? {} : { accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' }, value: `option:${option.id}` } }),
    })
    const shown = voterIds.slice(0, MAX_VOTERS_SHOWN).map((id) => `<@${id}>`).join(' ')
    const rest = voterIds.length > MAX_VOTERS_SHOWN ? ` ほか${voterIds.length - MAX_VOTERS_SHOWN}人` : ''
    blocks.push({
      type: 'context',
      block_id: `votes-${option.position}`,
      elements: [{ type: 'mrkdwn', text: `\`${bar(voterIds.length, voters.size)}\` ${voterIds.length}票${shown ? ` ・ ${shown}${rest}` : ''}` }],
    })
  }
  if (!closed) {
    blocks.push({
      type: 'actions',
      block_id: 'controls',
      elements: [
        { type: 'button', action_id: 'clear-vote', text: { type: 'plain_text', text: '自分の票を取り消す' } },
        {
          type: 'button',
          action_id: 'close',
          style: 'danger',
          text: { type: 'plain_text', text: '締め切る' },
          confirm: {
            title: { type: 'plain_text', text: '投票を締め切りますか？' },
            text: { type: 'plain_text', text: '締め切ると、誰も投票できなくなります。' },
            confirm: { type: 'plain_text', text: '締め切る' },
            deny: { type: 'plain_text', text: 'やめる' },
            style: 'danger',
          },
        },
      ],
    })
  }
  return { text: `投票: ${truncate(poll.question, 200)}`, blocks }
}

export const CREATE_POLL_CALLBACK_ID = 'create-poll'
export const POLL_OPTION_LIMITS = { min: 2, max: 10, labelMax: 100 } as const

export function createPollModal(channelId: string) {
  return {
    type: 'modal',
    callback_id: CREATE_POLL_CALLBACK_ID,
    private_metadata: JSON.stringify({ channelId }),
    title: { type: 'plain_text', text: '投票を作成' },
    submit: { type: 'plain_text', text: '作成' },
    close: { type: 'plain_text', text: 'キャンセル' },
    blocks: [
      { type: 'input', block_id: 'question', label: { type: 'plain_text', text: '質問' }, element: { type: 'plain_text_input', action_id: 'value', max_length: 150 } },
      {
        type: 'input',
        block_id: 'options',
        label: { type: 'plain_text', text: '選択肢（1行に1つ）' },
        hint: { type: 'plain_text', text: `${POLL_OPTION_LIMITS.min}〜${POLL_OPTION_LIMITS.max}個` },
        element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      },
      {
        type: 'input',
        block_id: 'mode',
        optional: true,
        label: { type: 'plain_text', text: '選び方' },
        element: {
          type: 'static_select',
          action_id: 'value',
          options: [
            { text: { type: 'plain_text', text: '1つだけ' }, value: 'single' },
            { text: { type: 'plain_text', text: '複数' }, value: 'multiple' },
          ],
          initial_option: { text: { type: 'plain_text', text: '1つだけ' }, value: 'single' },
        },
      },
    ],
  }
}

/** 作成した人以外が締め切ろうとしたときに見せるモーダル（カードは全員に同じで、押した本人にだけ知らせる手段がほかにないため） */
export function onlyCreatorCanCloseModal() {
  return {
    type: 'modal',
    title: { type: 'plain_text', text: '締め切れません' },
    close: { type: 'plain_text', text: '閉じる' },
    blocks: [{ type: 'section', text: { type: 'plain_text', text: '投票を締め切れるのは、作成した人だけです。' } }],
  }
}

export type ParsedPollInput = { ok: true; question: string; options: string[]; allowMultiple: boolean } | { ok: false; errors: Record<string, string> }

type StateValues = Record<string, Record<string, { value?: string | null; selected_option?: { value: string } | null }>>

/** モーダルの送信値を検証する。エラーは入力欄ごとの文言（アプリの文言としてそのまま表示される） */
export function parsePollSubmission(values: StateValues): ParsedPollInput {
  const question = (values['question']?.['value']?.value ?? '').trim()
  const lines = (values['options']?.['value']?.value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const options = [...new Set(lines)]
  const errors: Record<string, string> = {}
  if (!question) errors['question'] = '質問を入力してください'
  if (options.length < POLL_OPTION_LIMITS.min) errors['options'] = `選択肢を${POLL_OPTION_LIMITS.min}つ以上入力してください（重複は1つにまとめます）`
  else if (options.length > POLL_OPTION_LIMITS.max) errors['options'] = `選択肢は${POLL_OPTION_LIMITS.max}個までです`
  else if (options.some((option) => option.length > POLL_OPTION_LIMITS.labelMax)) errors['options'] = `選択肢は1つ${POLL_OPTION_LIMITS.labelMax}文字までです`
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, question, options, allowMultiple: values['mode']?.['value']?.selected_option?.value === 'multiple' }
}
