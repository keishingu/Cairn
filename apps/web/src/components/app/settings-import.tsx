'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseTeamsExport, summarizeConversation, type ImportBundle, type ImportConversation, type ImportIdentity } from '@cairn/core/import'
import { useT } from '@/components/locale-provider'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { useWorkspaceMembers } from '@/hooks/use-project-members'
import { useImportIdentities, useImportTargetChannels, useImportedConversations } from '@/hooks/use-imports'
import {
  collectExportFiles,
  identitiesForConversations,
  runImport,
  suggestMember,
  type CollectedExport,
  type ImportProgress,
  type ImportRunResult,
} from '@/lib/imports/client-runner'
import { createImportApi, postJson } from '@/lib/imports/client-api'
import { InlineError } from './inline-error'
import { Icon } from './primitives'

/**
 * 設定 > Teams から取り込む（owner / admin のみ）。docs/import-design.md
 *
 * エクスポートはブラウザの中で読み、管理者が「取り込む」を押すまで DB には何も書かない。
 * サーバーへ送るのは選んだ会話のメッセージと、そこから参照される画像だけ。
 */

type Step = 'select' | 'conversations' | 'mapping' | 'destination' | 'preview' | 'running' | 'done'

type Destination = { kind: 'new'; name: string } | { kind: 'existing'; channelId: string }



function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

function formatPeriod(conversation: ImportConversation): string {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')
  return `${day(conversation.firstMessageAt)} – ${day(conversation.lastMessageAt)}`
}

const sectionStyle: React.CSSProperties = { marginBottom: 24 }
const noteStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }
const cellStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--divider)', fontSize: 13, textAlign: 'left', verticalAlign: 'top' }

export function SettingsImport() {
  const t = useT()
  const { isAdmin } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const [step, setStep] = React.useState<Step>('select')
  const [error, setError] = React.useState<string | null>(null)
  const [reading, setReading] = React.useState(false)
  const [bundle, setBundle] = React.useState<ImportBundle | null>(null)
  const [collected, setCollected] = React.useState<CollectedExport | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [links, setLinks] = React.useState<Record<string, string>>({})
  const [destinations, setDestinations] = React.useState<Record<string, Destination>>({})
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [progress, setProgress] = React.useState<ImportProgress | null>(null)
  const [result, setResult] = React.useState<ImportRunResult | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const membersQuery = useWorkspaceMembers({ enabled: isAdmin })
  // 共有のフックは失敗時もレスポンスをそのまま返すので、配列でなければ取得失敗として扱う
  const membersInvalid = membersQuery.isSuccess && !Array.isArray(membersQuery.data)
  const members = Array.isArray(membersQuery.data) ? membersQuery.data : []
  const activeMembers = members.filter(member => member.membershipStatus === 'active')
  const channelsQuery = useImportTargetChannels(isAdmin)
  const identitiesQuery = useImportIdentities('teams-consumer', isAdmin)
  const importedConversationsQuery = useImportedConversations('teams-consumer', isAdmin)
  const channels = channelsQuery.data ?? []
  const existingIdentities = identitiesQuery.data ?? []
  const importedConversations = importedConversationsQuery.data ?? []
  // 取り込み先の既定（前回のチャンネル）と紐づけ済みの投稿者が分からないまま進むと、再実行で取り込み済みの分が
  // 新しいチャンネルに入らず空になるなど誤った結果になる。取得に失敗したらエラーを出し、取り込みを止める
  const prerequisiteQueries = [membersQuery, channelsQuery, identitiesQuery, importedConversationsQuery]
  const prerequisiteError = prerequisiteQueries.find(query => query.isError)?.error ?? (membersInvalid ? new Error(t('Could not load members')) : null)
  const prerequisitesReady = prerequisiteQueries.every(query => query.isSuccess) && !membersInvalid

  if (!isAdmin) {
    return (
      <div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>{t('Import from Teams')}</h1>
        <p style={noteStyle}>{t('Only workspace owners and admins can import past conversations.')}</p>
      </div>
    )
  }

  const selectedIds = bundle ? bundle.conversations.filter(c => selected.has(c.externalId)).map(c => c.externalId) : []
  const identityRows = bundle ? identitiesForConversations(bundle, selectedIds) : []
  const existingByKey = new Map(existingIdentities.map(identity => [identity.key, identity]))

  const handleFiles = async (fileList: FileList | null) => {
    setError(null)
    if (!fileList || fileList.length === 0) return
    setReading(true)
    try {
      const files = Array.from(fileList)
      const found = collectExportFiles(files)
      if (!found.messagesFile) throw new Error(t('messages.json was not found. Choose the folder of the Teams export (the one containing messages.json and media).'))
      // 数 MB 程度の JSON。端末の中だけで解析し、サーバーへは送らない
      const raw = JSON.parse(await found.messagesFile.text()) as unknown
      const parsed = parseTeamsExport(raw, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
      setBundle(parsed)
      setCollected(found)
      setSelected(new Set())
      setLinks({})
      setDestinations({})
      setStep('conversations')
    } catch (err) {
      setError(err instanceof SyntaxError ? t('messages.json could not be read as JSON.') : err instanceof Error ? err.message : t('Could not read the export.'))
    } finally {
      setReading(false)
    }
  }

  const destinationFor = (conversation: ImportConversation): Destination => {
    const chosen = destinations[conversation.externalId]
    if (chosen) return chosen
    const previous = importedConversations.find(c => c.externalConversationId === conversation.externalId && c.channelId && channels.some(ch => ch.id === c.channelId))
    if (previous?.channelId) return { kind: 'existing', channelId: previous.channelId }
    return { kind: 'new', name: (conversation.name ?? t('Teams import')).slice(0, 60) }
  }

  const mediaStats = () => {
    if (!bundle || !collected) return { available: 0, missing: 0, rejected: 0, bytes: 0 }
    const objectIds = new Set(selectedIds.flatMap(id => (bundle.messagesByConversation[id] ?? []).flatMap(m => m.media.map(x => x.objectId))))
    let available = 0, missing = 0, rejected = 0, bytes = 0
    for (const objectId of objectIds) {
      const media = collected.media.get(objectId)
      if (media) { available++; bytes += media.file.size }
      else if (collected.rejectedMedia.has(objectId)) rejected++
      else missing++
    }
    return { available, missing, rejected, bytes }
  }

  const startImport = async () => {
    if (!bundle || !collected) return
    setError(null)
    setStep('running')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      // 新しいチャンネルは非公開で作る（作った管理者だけが見える。公開範囲は後から変えられる）
      const plan: Array<{ externalId: string; channelId: string }> = []
      for (const conversation of bundle.conversations.filter(c => selected.has(c.externalId))) {
        const destination = destinationFor(conversation)
        if (destination.kind === 'existing') {
          plan.push({ externalId: conversation.externalId, channelId: destination.channelId })
        } else {
          const created = await postJson<{ id: string }>('/api/workspaces/channels', { name: destination.name.trim() || t('Teams import'), isPrivate: true }, t('Could not create the channel'))
          plan.push({ externalId: conversation.externalId, channelId: created.id })
          setDestinations(prev => ({ ...prev, [conversation.externalId]: { kind: 'existing', channelId: created.id } }))
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['workspace-channels'] })
      // 戻って会話の選択を変えると、選ばなくなった会話の投稿者の紐づけが残る。いま選んでいる会話の投稿者だけを送る
      const selectedKeys = new Set(identitiesForConversations(bundle, [...selected]).map(row => row.identity.key))
      const linkList = Object.entries(links).filter(([key, userId]) => userId && selectedKeys.has(key)).map(([key, userId]) => ({ key, userId }))
      const run = await runImport({ api: createImportApi(t), bundle, plan, links: linkList, collected, onProgress: setProgress, signal: controller.signal })
      setResult(run)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not start the import'))
      setStep('preview')
    } finally {
      abortRef.current = null
      void queryClient.invalidateQueries({ queryKey: ['import-identities'] })
      void queryClient.invalidateQueries({ queryKey: ['imported-conversations'] })
    }
  }

  const stepNav = (back: Step | null, next: Step | null, nextDisabled = false, nextLabel?: string) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      {back && <button type="button" className="btn" onClick={() => setStep(back)}>{t('Back')}</button>}
      {next && <button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={() => setStep(next)}>{nextLabel ?? t('Next')}</button>}
    </div>
  )

  const kindLabel = (conversation: ImportConversation) => {
    switch (conversation.kind) {
      case 'group': return t('Group / community')
      case 'one-on-one': return t('1:1 chat (not supported)')
      case 'meeting': return t('Meeting chat (not supported)')
      default: return t('Other (not supported)')
    }
  }

  const identityLabel = (identity: ImportIdentity) => {
    if (identity.anonymous) return t('Unknown poster')
    if (identity.displayName) return identity.displayName
    if (identity.kind === 'exporter') return t('The person who exported')
    return t('Participant without a name ({id})', { id: identity.key.slice(-6) })
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('Import from Teams')}</h1>
      <p style={{ ...noteStyle, marginBottom: 20 }}>
        {t('Import past group conversations from a Microsoft Teams (personal) export into Cairn channels. The export is read in your browser, and nothing is saved until you press Import.')}
      </p>

      {prerequisiteError && (
        <InlineError variant="box" style={{ marginBottom: 16 }}>
          {t('Could not load the information needed for importing. Reload the page and try again.')} {prerequisiteError instanceof Error ? prerequisiteError.message : ''}
        </InlineError>
      )}

      {error && <InlineError variant="box" style={{ marginBottom: 16 }}>{error}</InlineError>}

      {step === 'select' && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 14 }}>{t('1. Choose the export')}</h2>
          <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <p style={noteStyle}>{t('Choose the folder you got from teams.live.com/dataexport (chat history and media). Only messages.json and the images in media are read. Other files such as endpoints.json and invites.json are not read.')}</p>
            <label className="btn btn-primary" style={{ justifySelf: 'start', cursor: reading ? 'wait' : 'pointer', ...(prerequisitesReady ? {} : { opacity: 0.5, pointerEvents: 'none' as const }) }} aria-disabled={!prerequisitesReady}>
              <Icon name="download" size={14} /> {reading ? t('Reading...') : t('Choose export folder')}
              <input
                type="file"
                style={{ display: 'none' }}
                disabled={reading || !prerequisitesReady}
                // @ts-expect-error webkitdirectory はブラウザ独自の属性
                webkitdirectory=""
                multiple
                onChange={event => { void handleFiles(event.target.files); event.target.value = '' }}
              />
            </label>
          </div>
        </section>
      )}

      {step === 'conversations' && bundle && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 14 }}>{t('2. Choose conversations')}</h2>
          <p style={noteStyle}>{t('Only group conversations can be imported. 1:1 chats and meeting chats are private conversations with the other people and cannot be selected.')}</p>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={cellStyle} />
                  <th style={cellStyle}>{t('Conversation')}</th>
                  <th style={cellStyle}>{t('Type')}</th>
                  <th style={cellStyle}>{t('Messages')}</th>
                  <th style={cellStyle}>{t('Unknown posters')}</th>
                  <th style={cellStyle}>{t('Period')}</th>
                </tr>
              </thead>
              <tbody>
                {bundle.conversations
                  .slice()
                  .sort((a, b) => Number(b.importable) - Number(a.importable) || (bundle.messagesByConversation[b.externalId]?.length ?? 0) - (bundle.messagesByConversation[a.externalId]?.length ?? 0))
                  .map(conversation => {
                    const summary = summarizeConversation(bundle, conversation.externalId)
                    const checked = selected.has(conversation.externalId)
                    return (
                      <tr key={conversation.externalId} style={{ opacity: conversation.importable ? 1 : 0.55 }}>
                        <td style={cellStyle}>
                          <input
                            type="checkbox"
                            aria-label={conversation.name ?? t('Untitled conversation')}
                            disabled={!conversation.importable || summary.messages === 0}
                            checked={checked}
                            onChange={() => setSelected(prev => {
                              const next = new Set(prev)
                              if (next.has(conversation.externalId)) next.delete(conversation.externalId)
                              else next.add(conversation.externalId)
                              return next
                            })}
                          />
                        </td>
                        <td style={cellStyle}>{conversation.name ?? t('Untitled conversation')}<div style={noteStyle}>{t('{count} members', { count: conversation.memberCount })}</div></td>
                        <td style={cellStyle}>{kindLabel(conversation)}</td>
                        <td style={cellStyle}>{summary.messages}</td>
                        <td style={cellStyle}>{summary.messages > 0 ? `${summary.anonymousMessages}（${Math.round((summary.anonymousMessages / summary.messages) * 100)}%）` : '—'}</td>
                        <td style={cellStyle}>{formatPeriod(conversation)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {stepNav('select', 'mapping', selected.size === 0)}
        </section>
      )}

      {step === 'mapping' && bundle && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 14 }}>{t('3. Match posters to members')}</h2>
          <p style={noteStyle}>{t('Posters are not matched automatically, even when the names are the same. Choose a member only when you have confirmed it is the same person. Unknown posters stay as “Unknown poster” and cannot be matched. You can change this later.')}</p>
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
                {identityRows.map(({ identity, messages, reactions }) => {
                  const existing = existingByKey.get(identity.key)
                  const suggestion = suggestMember(identity, activeMembers)
                  return (
                    <tr key={identity.key}>
                      <td style={cellStyle}>{identityLabel(identity)}</td>
                      <td style={cellStyle}>{messages}</td>
                      <td style={cellStyle}>{reactions}</td>
                      <td style={cellStyle}>
                        {identity.anonymous ? (
                          <span style={noteStyle}>{t('Cannot be matched')}</span>
                        ) : existing?.linkedUserId ? (
                          <span>{t('Matched to {name}', { name: existing.linkedUserName ?? '' })}</span>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <select
                              aria-label={t('Cairn member for {name}', { name: identityLabel(identity) })}
                              value={links[identity.key] ?? ''}
                              onChange={event => setLinks(prev => ({ ...prev, [identity.key]: event.target.value }))}
                            >
                              <option value="">{t('Do not match')}</option>
                              {activeMembers.map(member => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
                            </select>
                            {suggestion && links[identity.key] !== suggestion.userId && (
                              <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => setLinks(prev => ({ ...prev, [identity.key]: suggestion.userId }))}>
                                {t('Candidate: {name} (choose)', { name: suggestion.displayName })}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {stepNav('conversations', 'destination')}
        </section>
      )}

      {step === 'destination' && bundle && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 14 }}>{t('4. Choose destination channels')}</h2>
          <p style={noteStyle}>{t('New channels are created as private channels that only you can see. After checking the result, you can add members or make the channel public. If you import the same conversation again, choose the channel you imported into before; messages that were already imported are skipped.')}</p>
          <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
            {bundle.conversations.filter(c => selected.has(c.externalId)).map(conversation => {
              const destination = destinationFor(conversation)
              return (
                <div key={conversation.externalId} style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{conversation.name ?? t('Untitled conversation')}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      aria-label={t('Destination for {name}', { name: conversation.name ?? '' })}
                      value={destination.kind === 'new' ? '__new__' : destination.channelId}
                      onChange={event => setDestinations(prev => ({
                        ...prev,
                        [conversation.externalId]: event.target.value === '__new__'
                          ? { kind: 'new', name: (conversation.name ?? t('Teams import')).slice(0, 60) }
                          : { kind: 'existing', channelId: event.target.value },
                      }))}
                    >
                      <option value="__new__">{t('Create a new private channel')}</option>
                      {channels.filter(channel => !channel.archived).map(channel => (
                        <option key={channel.id} value={channel.id}>#{channel.name ?? ''}{channel.isPrivate ? ` (${t('private')})` : ''}</option>
                      ))}
                    </select>
                    {destination.kind === 'new' && (
                      <input
                        aria-label={t('Channel name')}
                        maxLength={60}
                        value={destination.name}
                        onChange={event => setDestinations(prev => ({ ...prev, [conversation.externalId]: { kind: 'new', name: event.target.value } }))}
                      />
                    )}
                  </div>
                  <div style={noteStyle}>
                    {destination.kind === 'new'
                      ? t('Who can read: only you (private channel)')
                      : channels.find(ch => ch.id === destination.channelId)?.isPrivate
                        ? t('Who can read: members of this private channel')
                        : t('Who can read: all workspace members except guests')}
                  </div>
                </div>
              )
            })}
          </div>
          {stepNav('mapping', 'preview')}
        </section>
      )}

      {step === 'preview' && bundle && (() => {
        const totals = selectedIds.map(id => summarizeConversation(bundle, id)).reduce((acc, s) => {
          for (const [key, value] of Object.entries(s)) acc[key] = (acc[key] ?? 0) + value
          return acc
        }, {} as Record<string, number>)
        const media = mediaStats()
        const rows: Array<[string, number | string]> = [
          [t('Messages to import'), totals['messages'] ?? 0],
          [t('Messages from unknown posters (shown as “Unknown poster”)'), totals['anonymousMessages'] ?? 0],
          [t('Edited messages (only the latest text; no edit history)'), totals['editedMessages'] ?? 0],
          [t('Reactions'), totals['reactions'] ?? 0],
          [t('Images to upload'), `${media.available}（${formatBytes(media.bytes)}）`],
          [t('Images not found in the export'), media.missing],
          [t('Videos and other unsupported media (not imported)'), media.rejected],
          [t('File attachments kept as links only (files are not imported)'), totals['externalFiles'] ?? 0],
          [t('Mentions kept as text (no notifications)'), totals['mentions'] ?? 0],
          [t('Deleted messages (not imported)'), totals['deletedSkipped'] ?? 0],
          [t('System messages and calls (not imported)'), totals['systemSkipped'] ?? 0],
        ]
        return (
          <section style={sectionStyle}>
            <h2 style={{ fontSize: 14 }}>{t('5. Review before importing')}</h2>
            <div className="card" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {rows.map(([label, value]) => (
                    <tr key={label}><td style={cellStyle}>{label}</td><td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ padding: 14, marginTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t('Before you import')}</div>
              <ul style={{ ...noteStyle, margin: 0, paddingLeft: 18 }}>
                <li>{t('These are conversations of the original community members. Tell the members that their past messages will be moved to Cairn, and check that nobody objects.')}</li>
                <li>{t('Messages keep their original date and text. Reply threads are not restored, because the export does not contain them.')}</li>
                <li>{t('Notifications are not sent for imported messages.')}</li>
                <li>{t('Images are counted toward the workspace storage.')}</li>
              </ul>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
                <span>{t('I have informed the members and checked who can read the imported messages.')}</span>
              </label>
            </div>
            {stepNav('destination', null)}
            <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} disabled={!acknowledged || !prerequisitesReady} onClick={() => void startImport()}>
              {t('Import')}
            </button>
          </section>
        )
      })()}

      {step === 'running' && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 14 }}>{t('Importing...')}</h2>
          <div className="card" style={{ padding: 16, display: 'grid', gap: 8, fontSize: 13 }}>
            <div>{t('Images: {done} / {total}', { done: progress?.mediaDone ?? 0, total: progress?.mediaTotal ?? 0 })}</div>
            <div>{t('Messages: {done} / {total}', { done: progress?.messagesDone ?? 0, total: progress?.messagesTotal ?? 0 })}</div>
            <p style={noteStyle}>{t('Keep this page open. If the import stops, run it again with the same export and channels; messages that were already imported are skipped.')}</p>
            <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => abortRef.current?.abort()}>{t('Stop')}</button>
          </div>
        </section>
      )}

      {step === 'done' && result && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 14 }}>
            {result.status === 'completed' ? t('Import finished') : result.status === 'cancelled' ? t('Import stopped') : t('Import failed')}
          </h2>
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {([
                  [t('Imported messages'), result.imported],
                  [t('Already imported (skipped)'), result.duplicates],
                  [t('Attached images'), result.attachments],
                  [t('Imported reactions'), result.reactions],
                  [t('Images that could not be imported'), result.mediaFailures.length],
                ] as Array<[string, number]>).map(([label, value]) => (
                  <tr key={label}><td style={cellStyle}>{label}</td><td style={{ ...cellStyle, textAlign: 'right' }}>{value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.error && <InlineError style={{ marginTop: 8 }}>{result.error}</InlineError>}
          <p style={{ ...noteStyle, marginTop: 8 }}>{t('The report of what was not imported is saved with the import. Imported messages are marked as imported from Teams.')}</p>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => { setStep('select'); setResult(null); setProgress(null); setAcknowledged(false) }}>{t('Done')}</button>
        </section>
      )}
    </div>
  )
}
