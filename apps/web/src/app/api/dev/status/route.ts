// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceOwner } from '@/lib/permissions'

export type ServiceStatus = {
  status: 'ok' | 'error' | 'unconfigured'
  latencyMs?: number | undefined
  detail?: string | undefined
}

export type DevStatusDto = {
  supabaseDb: ServiceStatus
  supabaseStorage: ServiceStatus
  inngest: ServiceStatus
  openai: ServiceStatus
  tavily: ServiceStatus
  googleMaps: ServiceStatus
  env: {
    nodeEnv: string
    hasVapid: boolean
  }
}

async function checkWithLatency(fn: () => Promise<string | undefined>): Promise<ServiceStatus> {
  const t = Date.now()
  try {
    const detail = await fn()
    return { status: 'ok', latencyMs: Date.now() - t, detail }
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t, detail: String(err instanceof Error ? err.message : err) }
  }
}

async function checkSupabaseDb(): Promise<ServiceStatus> {
  if (!process.env['DATABASE_URL']) return { status: 'unconfigured', detail: 'DATABASE_URL 未設定' }
  return checkWithLatency(async () => {
    const { db } = await import('@cairn/db')
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`SELECT 1`)
    return '接続成功'
  })
}

async function checkSupabaseStorage(): Promise<ServiceStatus> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) return { status: 'unconfigured', detail: 'SUPABASE_URL / SERVICE_ROLE_KEY 未設定' }
  return checkWithLatency(async () => {
    const { createServiceRoleClient } = await import('@/lib/supabase/service')
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.storage.listBuckets()
    if (error) throw new Error(error.message)
    return data.length > 0 ? '接続成功' : 'バケット未作成'
  })
}

async function checkInngest(): Promise<ServiceStatus> {
  const key = process.env['INNGEST_EVENT_KEY']
  if (!key) return { status: 'unconfigured', detail: 'INNGEST_EVENT_KEY 未設定' }
  if (key === 'local') return { status: 'ok', detail: 'ローカル開発モード（Inngest Dev Server）' }
  return { status: 'ok', detail: 'Inngest Cloud 接続済み' }
}

async function checkOpenAI(): Promise<ServiceStatus> {
  const key = process.env['OPENAI_API_KEY']
  if (!key) return { status: 'unconfigured', detail: 'OPENAI_API_KEY 未設定' }

  const t = Date.now()
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    })
    const latencyMs = Date.now() - t

    if (res.ok) return { status: 'ok', latencyMs, detail: 'クレジット有効・API 正常' }

    let code: string | undefined
    try {
      const body = await res.json() as { error?: { code?: string; type?: string; message?: string } }
      code = body.error?.code ?? body.error?.type
    } catch { /* ignore */ }

    const detail = (() => {
      switch (code) {
        case 'insufficient_quota':    return 'クレジット残高なし'
        case 'rate_limit_exceeded':   return 'レート制限中（クレジットは有効）'
        case 'invalid_api_key':       return 'APIキーが無効'
        case 'model_not_found':       return 'モデルが見つかりません'
        case 'billing_hard_limit_reached': return '請求上限に達しました'
        default: return `HTTP ${res.status}${code ? ` (${code})` : ''}`
      }
    })()

    return { status: 'error', latencyMs, detail }
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t, detail: String(err instanceof Error ? err.message : err) }
  }
}

async function checkTavily(): Promise<ServiceStatus> {
  const key = process.env['TAVILY_API_KEY']
  if (!key) return { status: 'unconfigured', detail: 'TAVILY_API_KEY 未設定（省略可）' }
  return { status: 'ok', detail: 'API キー設定済み' }
}

async function checkGoogleMaps(): Promise<ServiceStatus> {
  const key = process.env['GOOGLE_MAPS_API_KEY']
  if (!key) return { status: 'unconfigured', detail: 'GOOGLE_MAPS_API_KEY 未設定（省略可 — 場所検索・カバー写真取得が無効）' }
  if (key.length !== 39) return { status: 'error', detail: `APIキーの文字数が不正です（${key.length}文字 / 期待値: 39文字）` }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return { status: 'error', detail: 'APIキーに使用できない文字が含まれています（英数字・-・_のみ）' }
  return { status: 'ok', detail: 'API キー設定済み（Places API New）' }
}

function getStaticStatus(): DevStatusDto {
  return {
    supabaseDb: process.env['DATABASE_URL']
      ? { status: 'ok', detail: 'DATABASE_URL 設定済み' }
      : { status: 'unconfigured', detail: 'DATABASE_URL 未設定' },
    supabaseStorage:
      process.env['NEXT_PUBLIC_SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY']
        ? { status: 'ok', detail: 'Supabase Storage 設定済み' }
        : { status: 'unconfigured', detail: 'SUPABASE_URL / SERVICE_ROLE_KEY 未設定' },
    inngest: process.env['INNGEST_EVENT_KEY']
      ? process.env['INNGEST_EVENT_KEY'] === 'local'
        ? { status: 'ok', detail: 'ローカル開発モード（Inngest Dev Server）' }
        : { status: 'ok', detail: 'INNGEST_EVENT_KEY 設定済み' }
      : { status: 'unconfigured', detail: 'INNGEST_EVENT_KEY 未設定' },
    openai: process.env['OPENAI_API_KEY']
      ? { status: 'ok', detail: 'OPENAI_API_KEY 設定済み' }
      : { status: 'unconfigured', detail: 'OPENAI_API_KEY 未設定' },
    tavily: process.env['TAVILY_API_KEY']
      ? { status: 'ok', detail: 'API キー設定済み' }
      : { status: 'unconfigured', detail: 'TAVILY_API_KEY 未設定（省略可）' },
    googleMaps: (() => {
      const key = process.env['GOOGLE_MAPS_API_KEY']
      if (!key) return { status: 'unconfigured', detail: 'GOOGLE_MAPS_API_KEY 未設定（省略可 — 場所検索・カバー写真取得が無効）' }
      if (key.length !== 39) return { status: 'error', detail: `APIキーの文字数が不正です（${key.length}文字 / 期待値: 39文字）` }
      if (!/^[A-Za-z0-9_-]+$/.test(key)) return { status: 'error', detail: 'APIキーに使用できない文字が含まれています（英数字・-・_のみ）' }
      return { status: 'ok', detail: 'API キー設定済み（Places API New）' }
    })(),
    env: {
      nodeEnv: process.env['NODE_ENV'] ?? 'unknown',
      hasVapid: !!process.env['VAPID_PUBLIC_KEY'],
    },
  }
}

async function authorizeOwner() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  return requireWorkspaceOwner(ctx.workspaceId, ctx.userId)
}

export async function GET() {
  const authError = await authorizeOwner()
  if (authError) return authError

  return NextResponse.json(getStaticStatus())
}

export async function POST() {
  const authError = await authorizeOwner()
  if (authError) return authError

  const [supabaseDb, supabaseStorage, inngest, openai, tavily, googleMaps] = await Promise.all([
    checkSupabaseDb(),
    checkSupabaseStorage(),
    checkInngest(),
    checkOpenAI(),
    checkTavily(),
    checkGoogleMaps(),
  ])

  const result: DevStatusDto = {
    supabaseDb, supabaseStorage, inngest, openai, tavily, googleMaps,
    env: {
      nodeEnv: process.env['NODE_ENV'] ?? 'unknown',
      hasVapid: !!process.env['VAPID_PUBLIC_KEY'],
    },
  }
  return NextResponse.json(result)
}
