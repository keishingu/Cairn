// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// モーダルの送信値を、保存済みの view の入力欄と照合して Slack の state.values の形にする。
// 必須・文字数・選択肢をサーバーで確かめ、クライアントが送った値をそのままアプリへ届けない

export type SubmittedValues = Record<string, Record<string, string | null | undefined> | undefined>

export type StateValue =
  | { type: 'plain_text_input'; value: string | null }
  | { type: 'static_select'; selected_option: { text: unknown; value: string; description?: unknown } | null }

/** 入力欄ごとのエラー。code は Cairn の検証（表示時に翻訳）、message はアプリが返した文言（そのまま表示） */
export type FieldError = { code: 'required' | 'too_short' | 'too_long' | 'invalid_option' } | { message: string }

export type SubmissionResult =
  | { ok: true; values: Record<string, Record<string, StateValue>> }
  | { ok: false; errors: Record<string, FieldError> }

type StoredInputBlock = {
  type: 'input'
  block_id: string
  optional?: boolean
  element: {
    type: string
    action_id: string
    min_length?: number
    max_length?: number
    options?: Array<{ text: unknown; value: string; description?: unknown }>
  }
}

function inputBlocksOf(view: unknown): StoredInputBlock[] {
  const blocks = (view as { blocks?: unknown })?.blocks
  if (!Array.isArray(blocks)) return []
  return blocks.filter((block): block is StoredInputBlock => (block as { type?: unknown })?.type === 'input')
}

export function validateSubmission(view: unknown, submitted: SubmittedValues): SubmissionResult {
  // block_id は アプリが決める文字列（"__proto__" も通る）ので、プロトタイプの無い入れ物に入れる
  const values: Record<string, Record<string, StateValue>> = Object.create(null)
  const errors: Record<string, FieldError> = Object.create(null)
  for (const block of inputBlocksOf(view)) {
    const { element } = block
    const raw = submitted[block.block_id]?.[element.action_id]
    const value = typeof raw === 'string' && raw.length > 0 ? raw : null
    if (value === null && !block.optional) {
      errors[block.block_id] = { code: 'required' }
      continue
    }
    if (element.type === 'plain_text_input') {
      if (value !== null && element.min_length !== undefined && value.length < element.min_length) errors[block.block_id] = { code: 'too_short' }
      else if (value !== null && value.length > (element.max_length ?? 3000)) errors[block.block_id] = { code: 'too_long' }
      else values[block.block_id] = Object.assign(Object.create(null), { [element.action_id]: { type: 'plain_text_input', value } })
      continue
    }
    if (element.type === 'static_select') {
      const option = value === null ? null : (element.options ?? []).find((candidate) => candidate.value === value)
      if (value !== null && !option) errors[block.block_id] = { code: 'invalid_option' }
      else values[block.block_id] = Object.assign(Object.create(null), { [element.action_id]: { type: 'static_select', selected_option: option ?? null } })
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values }
}

export type AppViewResponse =
  | { action: 'close' }
  | { action: 'errors'; errors: Record<string, FieldError> }
  | { action: 'update'; view: unknown }
  | { action: 'invalid' }

/** view_submission へのアプリの同期応答（response_action）。空の 200 と clear は閉じ、読めない応答は閉じずに invalid にする */
export function parseViewSubmissionResponse(body: string): AppViewResponse {
  if (!body.trim()) return { action: 'close' }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    // プロキシの HTML や途中で切れた応答で、入力を捨てて閉じない
    return { action: 'invalid' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { action: 'invalid' }
  const responseAction = (parsed as { response_action?: unknown })?.response_action
  if (responseAction === 'errors') {
    const raw = (parsed as { errors?: unknown }).errors
    const errors: Record<string, FieldError> = {}
    if (typeof raw === 'object' && raw !== null) {
      for (const [blockId, message] of Object.entries(raw)) {
        if (typeof message === 'string') errors[blockId] = { message: message.slice(0, 300) }
      }
    }
    return { action: 'errors', errors }
  }
  // push は第1段階では重ねず差し替える（view の積み重ねは未対応）
  if (responseAction === 'update' || responseAction === 'push') return { action: 'update', view: (parsed as { view?: unknown }).view }
  if (responseAction === undefined || responseAction === 'clear') return { action: 'close' }
  return { action: 'invalid' }
}

/**
 * アプリが返した errors のうち、今の view の入力欄に出せるものだけを残す。
 * 1つも出せなければ null（送信しても何も起きないように見えるため、呼び出し側は不正な応答として扱う）
 */
export function displayableErrors(view: unknown, errors: Record<string, FieldError>): Record<string, FieldError> | null {
  const blocks = (view as { blocks?: unknown })?.blocks
  const inputIds = new Set(
    (Array.isArray(blocks) ? blocks : [])
      .filter((block): block is { type: 'input'; block_id: string } => (block as { type?: unknown })?.type === 'input' && typeof (block as { block_id?: unknown }).block_id === 'string')
      .map((block) => block.block_id),
  )
  const shown = Object.fromEntries(Object.entries(errors).filter(([blockId]) => inputIds.has(blockId)))
  return Object.keys(shown).length > 0 ? shown : null
}
