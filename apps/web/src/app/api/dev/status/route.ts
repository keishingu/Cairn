// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

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
  env: {
    nodeEnv: string
    hasDatabase: boolean
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
    return process.env['DATABASE_URL']!.replace(/:\/\/[^@]+@/, '://***@')
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
    return `${data.length} バケット`
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
  return checkWithLatency(async () => {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return 'API 応答確認済み'
  })
}

async function checkTavily(): Promise<ServiceStatus> {
  const key = process.env['TAVILY_API_KEY']
  if (!key) return { status: 'unconfigured', detail: 'TAVILY_API_KEY 未設定（省略可）' }
  return { status: 'ok', detail: 'API キー設定済み' }
}

export async function GET() {
  const { error } = await getAuthContext()
  if (error) return error

  const [supabaseDb, supabaseStorage, inngest, openai, tavily] = await Promise.all([
    checkSupabaseDb(),
    checkSupabaseStorage(),
    checkInngest(),
    checkOpenAI(),
    checkTavily(),
  ])

  const result: DevStatusDto = {
    supabaseDb, supabaseStorage, inngest, openai, tavily,
    env: {
      nodeEnv: process.env['NODE_ENV'] ?? 'unknown',
      hasDatabase: !!process.env['DATABASE_URL'],
      hasVapid: !!process.env['VAPID_PUBLIC_KEY'],
    },
  }
  return NextResponse.json(result)
}
