// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { displayAppName, appAddErrorMessage, cardActionErrorMessage } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Icon, Modal } from '@/components/app/primitives'
import { useAppEntryPoints } from '@/hooks/use-app-entry-points'
import type { AppEntryPointDto } from '@/app/api/channels/[channelId]/app-entry-points/route'

// 入力欄の「＋」に並べるアプリの起動口（docs/app-platform-design.md §6.1）。選ぶとスラッシュコマンドと同じ形でアプリへ届き、
// アプリはモーダルを開くなどして応える。Bot がまだチャンネルにいなければ、起動の前に追加を確かめる（§11 D7）

type PendingEntry = { app: AppEntryPointDto; command: string }

export function AppEntryButtons({ channelId, onError, compact }: { channelId: string; onError: (message: string | null) => void; compact?: boolean }) {
  const t = useT()
  const { query, invoke: invokeEntry, busy } = useAppEntryPoints(channelId)
  const [confirming, setConfirming] = React.useState<PendingEntry | null>(null)

  const invoke = async ({ app, command }: PendingEntry) => {
    onError(null)
    const failure = await invokeEntry(app, command)
    if (!failure) return
    // 追加 API の本文は日本語固定なので見せず、状態コードから表示言語の案内にする
    onError(t(failure.step === 'add' ? appAddErrorMessage(failure.status) : cardActionErrorMessage(failure.code)))
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
            title={`${displayAppName({ name: app.appName, firstParty: app.firstParty }, t)}: ${t(entry.label)}`}
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
        <Modal onClose={() => setConfirming(null)} label={t('Add {app} to this channel?', { app: displayAppName({ name: confirming.app.appName, firstParty: confirming.app.firstParty }, t) })} role="alertdialog">
          <div className="card" style={{ width: 380, maxWidth: '90vw', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{t('Add {app} to this channel?', { app: displayAppName({ name: confirming.app.appName, firstParty: confirming.app.firstParty }, t) })}</h2>
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
