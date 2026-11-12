'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '@/components/locale-provider'
import { useImportIdentities } from '@/hooks/use-imports'
import { useWorkspaceMembers } from '@/hooks/use-project-members'
import { linkImportedIdentity } from '@/lib/imports/client-api'
import { InlineError } from './inline-error'

/**
 * 取り込んだ投稿者と Cairn のメンバーの紐づけ（owner / admin）。docs/import-design.md §5
 * 紐づけると、公開済みの過去ログとリアクションの送信者がその人に付け替わる。外すと Teams の名前に戻る。
 * 表示名だけで自動では紐づけない。投稿者不明は紐づけられない
 */
export function ImportedIdentitiesPanel({ enabled }: { enabled: boolean }) {
  const t = useT()
  const queryClient = useQueryClient()
  const identitiesQuery = useImportIdentities('teams-consumer', enabled)
  const membersQuery = useWorkspaceMembers({ enabled })
  // メンバー一覧が取れるまで紐づけを変えさせない（空の一覧で「紐づけない」しか選べない状態にしない）
  const members = membersQuery.data?.filter(member => member.membershipStatus === 'active') ?? []
  const membersReady = membersQuery.isSuccess
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  if (!enabled) return null
  if (identitiesQuery.isError) {
    return (
      <InlineError variant="box">
        {t('Could not load imported participants')} {identitiesQuery.error instanceof Error ? identitiesQuery.error.message : ''}
      </InlineError>
    )
  }
  const identities = (identitiesQuery.data ?? []).filter(identity => !identity.isAnonymous && identity.messageCount + identity.reactedCount > 0)
  if (identitiesQuery.isPending || identities.length === 0) return null

  const change = async (identityId: string, userId: string | null) => {
    setError(null)
    setPending(identityId)
    try {
      await linkImportedIdentity(identityId, userId, t('Could not change the match'))
      await queryClient.invalidateQueries({ queryKey: ['import-identities'] })
      // 送信者が付け替わるので、開いているチャットを読み直す
      await queryClient.invalidateQueries({ queryKey: ['messages'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not change the match'))
    } finally {
      setPending(null)
    }
  }

  const cellStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--divider)', fontSize: 13, textAlign: 'left', verticalAlign: 'top' }
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 14 }}>{t('Imported participants')}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
        {t('Match participants of the imported conversations to members. Their past messages and reactions are then shown as the member. Choose a member only when you have confirmed it is the same person.')}
      </p>
      {membersQuery.isError && (
        <InlineError variant="box" style={{ marginBottom: 8 }}>
          {t('Could not load members')} {membersQuery.error instanceof Error ? membersQuery.error.message : ''}
        </InlineError>
      )}
      {error && <InlineError variant="box" style={{ marginBottom: 8 }}>{error}</InlineError>}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>{t('Poster in Teams')}</th>
              <th style={cellStyle}>{t('Messages')}</th>
              <th style={cellStyle}>{t('Reactions')}</th>
              <th style={cellStyle}>{t('Cairn member')}</th>
            </tr>
          </thead>
          <tbody>
            {identities.map(identity => (
              <tr key={identity.id}>
                <td style={cellStyle}>{identity.displayName ?? t('Participant without a name ({id})', { id: identity.key.slice(-6) })}</td>
                <td style={cellStyle}>{identity.publishedCount}</td>
                <td style={cellStyle}>{identity.reactedCount}</td>
                <td style={cellStyle}>
                  <select
                    aria-label={t('Cairn member for {name}', { name: identity.displayName ?? '' })}
                    value={identity.linkedUserId ?? ''}
                    disabled={!membersReady || pending === identity.id}
                    onChange={event => void change(identity.id, event.target.value || null)}
                  >
                    <option value="">{t('Do not match')}</option>
                    {members.map(member => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
