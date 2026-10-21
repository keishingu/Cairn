// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto'
import { checkRequestUrl } from './request-url'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signRequest } from './signing'

// Slack と同じく3秒。リトライはしない（応答が失われた場合は利用者がやり直し、アプリは interaction_id で重複を除く。§5.4）
export const INTERACTION_TIMEOUT_MS = 3000

export type CardActionRequest =
  | { type: 'button'; blockId: string; actionId: string }
  | { type: 'static_select'; blockId: string; actionId: string; selectedOptionValue: string }

type StoredOption = { text: { type: 'plain_text'; text: string; emoji?: boolean }; value: string; description?: unknown }

/** アプリへ届ける action。値はクライアントから受け取らず、保存済みの blocks から引く（改ざんした値を届かせない。§5.1） */
export type ResolvedAction =
  | { type: 'button'; block_id: string; action_id: string; text: unknown; value?: string; style?: string }
  | { type: 'static_select'; block_id: string; action_id: string; selected_option: StoredOption }

export type ResolveActionResult = { ok: true; action: ResolvedAction } | { ok: false; error: 'action_not_found' | 'invalid_option' }

/** 保存済み blocks の中から、押された要素を block_id と action_id で探す。URL だけのボタンは配送対象にしない */
export function resolveAction(storedBlocks: unknown, request: CardActionRequest): ResolveActionResult {
  if (!Array.isArray(storedBlocks)) return { ok: false, error: 'action_not_found' }
  const block = storedBlocks.find(
    (candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' && candidate !== null && (candidate as { block_id?: unknown }).block_id === request.blockId,
  )
  if (!block) return { ok: false, error: 'action_not_found' }
  const elements =
    block['type'] === 'actions' && Array.isArray(block['elements'])
      ? (block['elements'] as unknown[])
      : block['type'] === 'section' && block['accessory']
        ? [block['accessory']]
        : []
  const element = elements.find(
    (candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' && candidate !== null && (candidate as { action_id?: unknown }).action_id === request.actionId,
  )
  if (!element || element['type'] !== request.type) return { ok: false, error: 'action_not_found' }

  if (request.type === 'button') {
    return {
      ok: true,
      action: {
        type: 'button',
        block_id: request.blockId,
        action_id: request.actionId,
        text: element['text'],
        ...(typeof element['value'] === 'string' ? { value: element['value'] } : {}),
        ...(typeof element['style'] === 'string' ? { style: element['style'] } : {}),
      },
    }
  }
  const options = Array.isArray(element['options']) ? (element['options'] as StoredOption[]) : []
  const selected = options.find((option) => option?.value === request.selectedOptionValue)
  if (!selected) return { ok: false, error: 'invalid_option' }
  return { ok: true, action: { type: 'static_select', block_id: request.blockId, action_id: request.actionId, selected_option: selected } }
}

export type BlockActionsContext = {
  workspace: { id: string; slug: string }
  user: { id: string; name: string }
  appId: string
  channel: { id: string; name: string | null }
  message: { id: string; text: string; botProfileId: string; installationId: string; blocks: unknown }
  action: ResolvedAction
}

/** Slack の block_actions と同じ形。ID は UUID のまま入れ、cairn.* にも併記する（§11 D3） */
export function buildBlockActionsPayload(context: BlockActionsContext, interactionId: string, nowMs = Date.now()) {
  return {
    type: 'block_actions',
    team: { id: context.workspace.id, domain: context.workspace.slug },
    user: { id: context.user.id, name: context.user.name, team_id: context.workspace.id },
    api_app_id: context.appId,
    // 非推奨の verification token は送らない（署名で検証する）
    token: '',
    container: { type: 'message', message_ts: context.message.id, channel_id: context.channel.id, is_ephemeral: false },
    channel: { id: context.channel.id, name: context.channel.name ?? '' },
    message: {
      type: 'message',
      ts: context.message.id,
      text: context.message.text,
      user: context.message.botProfileId,
      bot_id: context.message.installationId,
      blocks: context.message.blocks,
    },
    actions: [{ ...context.action, action_ts: (nowMs / 1000).toFixed(6) }],
    cairn: { message_id: context.message.id, interaction_id: interactionId },
  }
}

export type DeliveryResult =
  | { status: 'delivered'; httpStatus: number; durationMs: number; body: string }
  | { status: 'failed' | 'timeout' | 'blocked'; httpStatus: number | null; durationMs: number; error: string }

/**
 * 署名して Request URL へ送る。リダイレクトは追わない（検証した送り先から内部のアドレスへ飛ばされないように）。
 * 名前解決の検証と実際の接続の間に DNS が差し替わる余地は残る。外部アプリを公開する第2段階で、検証済みアドレスへの接続に固定する
 */
export async function deliverToApp(input: {
  requestUrl: string
  signingSecret: string
  payload: unknown
  fetchImpl?: typeof fetch
  checkUrl?: typeof checkRequestUrl
}): Promise<DeliveryResult> {
  const started = Date.now()
  const check = await (input.checkUrl ?? checkRequestUrl)(input.requestUrl)
  if (!check.ok) return { status: 'blocked', httpStatus: null, durationMs: Date.now() - started, error: check.reason }

  // Bolt が読む形。payload=<JSON> の form-urlencoded
  const body = new URLSearchParams({ payload: JSON.stringify(input.payload) }).toString()
  const timestamp = Math.floor(Date.now() / 1000)
  try {
    const response = await (input.fetchImpl ?? fetch)(check.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signRequest(input.signingSecret, timestamp, body),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(INTERACTION_TIMEOUT_MS),
    })
    const durationMs = Date.now() - started
    const text = await response.text().catch(() => '')
    if (response.status >= 200 && response.status < 300) return { status: 'delivered', httpStatus: response.status, durationMs, body: text }
    return { status: 'failed', httpStatus: response.status, durationMs, error: `HTTP ${response.status}` }
  } catch (err) {
    const durationMs = Date.now() - started
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return { status: timedOut ? 'timeout' : 'failed', httpStatus: null, durationMs, error: err instanceof Error ? err.message : String(err) }
  }
}

export function newInteractionId(): string {
  return randomUUID()
}
