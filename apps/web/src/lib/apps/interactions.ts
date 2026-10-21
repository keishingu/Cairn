// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkRequestUrl, guardedLookup } from './request-url'
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
  /** views.open に使う。押した本人とインストールに結びついた、3秒・1回だけの ID */
  triggerId: string
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
    trigger_id: context.triggerId,
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

/** 送信の実体。テストでは差し替える */
export type Sender = (input: {
  url: URL
  headers: Record<string, string>
  body: string
  timeoutMs: number
  allowLoopback: boolean
}) => Promise<{ status: number; body: string }>

/**
 * node:http(s) で送る。接続時の名前解決（guardedLookup）で内部アドレスを拒否するので、
 * checkRequestUrl の後に DNS を差し替えられても内部へは接続しない。リダイレクトは追わない（request は追わない）
 */
const nodeSender: Sender = ({ url, headers, body, timeoutMs, allowLoopback }) =>
  new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() }, lookup: guardedLookup(allowLoopback), timeout: timeoutMs },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          // 応答は view などの小さな JSON だけを想定する。大きな応答で関数のメモリを使い切らせない
          size += chunk.length
          if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk)
        })
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
        response.on('error', reject)
      },
    )
    // timeout オプションは無通信の時間しか見ないため、少しずつ返し続ける相手にも全体で打ち切る
    const abort = () => request.destroy(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))
    const timer = setTimeout(abort, timeoutMs)
    request.on('timeout', abort)
    request.on('close', () => clearTimeout(timer))
    request.on('error', reject)
    request.end(body)
  })

const MAX_RESPONSE_BYTES = 256 * 1024

/** 署名して Request URL へ送る */
export async function deliverToApp(input: {
  requestUrl: string
  signingSecret: string
  /** block_actions・view_submission は payload=<JSON> で送る */
  payload?: unknown
  /** スラッシュコマンドと同じく、フィールドを並べた form で送る（作成メニューからの起動。§6.1） */
  form?: Record<string, string>
  /** 署名以外に付けるヘッダー（同じデプロイへの呼び出しの Deployment Protection 回避だけに使う） */
  headers?: Record<string, string>
  send?: Sender
  checkUrl?: typeof checkRequestUrl
}): Promise<DeliveryResult> {
  const started = Date.now()
  // 3秒は URL の検証（DNS の名前解決）も含めた全体の期限。名前解決が止まっても配信全体はこれを超えない
  const check = await withDeadline((input.checkUrl ?? checkRequestUrl)(input.requestUrl), INTERACTION_TIMEOUT_MS)
  if (check === 'timeout') return { status: 'timeout', httpStatus: null, durationMs: Date.now() - started, error: 'Request URL の検証が時間内に終わりませんでした' }
  if (!check.ok) return { status: 'blocked', httpStatus: null, durationMs: Date.now() - started, error: check.reason }
  const remainingMs = INTERACTION_TIMEOUT_MS - (Date.now() - started)
  if (remainingMs <= 0) return { status: 'timeout', httpStatus: null, durationMs: Date.now() - started, error: 'Request URL の検証が時間内に終わりませんでした' }

  // Bolt が読む形。interactivity は payload=<JSON>、スラッシュコマンドはフィールドを並べた form-urlencoded
  const body = new URLSearchParams(input.form ?? { payload: JSON.stringify(input.payload) }).toString()
  const timestamp = Math.floor(Date.now() / 1000)
  try {
    const response = await (input.send ?? nodeSender)({
      url: check.url,
      headers: {
        ...input.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signRequest(input.signingSecret, timestamp, body),
      },
      body,
      timeoutMs: remainingMs,
      allowLoopback: check.devLoopback,
    })
    const durationMs = Date.now() - started
    if (response.status >= 200 && response.status < 300) return { status: 'delivered', httpStatus: response.status, durationMs, body: response.body }
    return { status: 'failed', httpStatus: response.status, durationMs, error: `HTTP ${response.status}` }
  } catch (err) {
    const durationMs = Date.now() - started
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'EBLOCKEDADDRESS') return { status: 'blocked', httpStatus: null, durationMs, error: (err as Error).message }
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return { status: timedOut ? 'timeout' : 'failed', httpStatus: null, durationMs, error: err instanceof Error ? err.message : String(err) }
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

export function newInteractionId(): string {
  return randomUUID()
}
