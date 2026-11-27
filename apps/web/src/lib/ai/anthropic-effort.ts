// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Claude Sonnet 5.5 の既定 effort は high で、ツールを何度も呼ぶ /ai の調査では 1 ステップごとに
// 出力・思考トークンを多く使う。Opus 5.5 の既定は最初から medium なので揃える対象外。
// @ai-sdk/anthropic v1 は output_config を渡す手段を持たず、providerOptions にも無いため、
// fetch 層でリクエスト本文へ差し込む。値は固定（設定・フラグは設けない）。
const EFFORT_TARGET_MODEL = 'claude-sonnet-5-5'
const EFFORT_VALUE = 'medium'

// JSON 本文の model が対象モデルのときだけ output_config.effort を補う。
// 既存の output_config のキーは残し、明示済みの effort は上書きしない。
// 対象外・JSON でない本文は同じ値をそのまま返す（バイト列を変えない）。
export function withSonnetEffort(body: unknown): unknown {
  if (typeof body !== 'string') return body
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return body
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return body
  const record = parsed as Record<string, unknown>
  if (record['model'] !== EFFORT_TARGET_MODEL) return body

  const existing = record['output_config']
  const outputConfig =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {}
  if (outputConfig['effort'] !== undefined) return body
  return JSON.stringify({ ...record, output_config: { ...outputConfig, effort: EFFORT_VALUE } })
}

export function createEffortFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') {
      return baseFetch(input, init)
    }
    return baseFetch(input, { ...init, body: withSonnetEffort(init.body) as string })
  }) as typeof fetch
}
