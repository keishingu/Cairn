// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cardActionErrorMessage } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Icon, Modal } from '@/components/app/primitives'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { AppEntryPointDto } from '@/app/api/channels/[channelId]/app-entry-points/route'

// 入力欄の「＋」に並べるアプリの起動口（docs/app-platform-design.md §6.1）。選ぶとスラッシュコマンドと同じ形でアプリへ届き、
// アプリはモーダルを開くなどして応える。Bot がまだチャンネルにいなければ、起動の前に追加を確かめる（§11 D7）

type PendingEntry = { app: AppEntryPointDto; command: string }

async function readError(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' ? body.error : null
}

export function AppEntryButtons({ channelId, onError, compact }: { channelId: string; onError: (message: string | null) => void; compact?: boolean }) {
  const t = useT()
  const queryClient = useQueryClient()
  const queryKey = ['app-entry-points', channelId] as const
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<AppEntryPointDto[]> => {
      const res = await fetchWithAuth(`/api/channels/${channelId}/app-entry-points`)
      if (!res.ok) throw new Error(`app-entry-points ${res.status}`)
      return res.json()
    },
  })
  const [confirming, setConfirming] = React.useState<PendingEntry | null>(null)
  const [busy, setBusy] = React.useState(false)

  const invoke = async ({ app, command }: PendingEntry) => {
    setBusy(true)
    onError(null)
    try {
      if (!app.inChannel) {
        const added = await fetchWithAuth(`/api/channels/${channelId}/apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installationId: app.installationId }),
        })
        if (!added.ok) {
          // このエンドポイントは日本語の理由を返す（権限・チャンネルの種類）
          onError((await readError(added)) ?? t(cardActionErrorMessage(null)))
          return
        }
        await queryClient.invalidateQueries({ queryKey })
      }
      const res = await fetchWithAuth('/api/app-commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: app.installationId, channelId, command }),
      })
      if (!res.ok) onError(t(cardActionErrorMessage(await readError(res))))
    } catch {
      onError(t(cardActionErrorMessage(null)))
    } finally {
      setBusy(false)
    }
  }

  const buttonStyle: React.CSSProperties = compact
    ? { border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center' }
    : { border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }

  if (query.isError) {
    // 読み込めなかったことを黙って隠さない
    return (
      <button type="button" onClick={() => void query.refetch()} style={{ ...buttonStyle, color: 'var(--red-text)' }} title={t('Retry')}>
        {t('Could not load apps')}
      </button>
    )
  }

  return (
    <>
      {(query.data ?? []).flatMap((app) =>
        app.entryPoints.map((entry) => (
          <button
            key={`${app.installationId}:${entry.command}`}
            type="button"
            disabled={busy}
            title={`${app.appName}: ${t(entry.label)}`}
            aria-label={t(entry.label)}
            onClick={() => (app.inChannel ? void invoke({ app, command: entry.command }) : setConfirming({ app, command: entry.command }))}
            style={buttonStyle}
          >
            <Icon name="list" size={compact ? 15 : 13} />
            {!compact && t(entry.label)}
          </button>
        )),
      )}
      {confirming && (
        <Modal onClose={() => setConfirming(null)} label={t('Add {app} to this channel?', { app: confirming.app.appName })} role="alertdialog">
          <div className="card" style={{ width: 380, maxWidth: '90vw', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{t('Add {app} to this channel?', { app: confirming.app.appName })}</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16 }}>{t('The app will be able to post to this channel.')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setConfirming(null)}>{t('Cancel')}</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const entry = confirming
                  setConfirming(null)
                  void invoke(entry)
                }}
              >
                {t('Add')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
