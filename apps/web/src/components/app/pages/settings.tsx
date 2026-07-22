'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { ConfirmDialog } from '../confirm-dialog'
import { RowActionMenu } from '../row-action-menu'
import { TopBar } from '../sidebar'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from '@/lib/use-workspace-settings'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { processImageForUpload } from '@/lib/process-image'
import type { GcalStatusDto } from '@/app/api/calendar/google/status/route'
import type { GcalCalendarDto } from '@/app/api/calendar/google/calendars/route'

class GcalCalendarsError extends Error {
  code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'GcalCalendarsError'
    this.code = code
  }
}

const Toggle = ({ on }: { on: boolean }) => (
  <div style={{
    width: 36, height: 20, borderRadius: 999, padding: 2,
    background: on ? 'var(--accent)' : 'var(--border-2)',
    transition: 'background .15s', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
    justifyContent: on ? 'flex-end' : 'flex-start',
  }}>
    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }}/>
  </div>
)

type ThemeValue = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'light',  label: 'ライト',   icon: 'sun' },
  { value: 'system', label: 'システム', icon: 'monitor' },
  { value: 'dark',   label: 'ダーク',   icon: 'moon' },
]

function initials(name: string) {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AvatarCircle = ({ url, name, size = 64 }: { url?: string | null; name: string; size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: url ? 'var(--border)' : 'var(--accent)',
    flexShrink: 0, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.35, fontWeight: 700, color: url ? undefined : 'var(--on-accent)',
  }}>
    {url
      ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      : initials(name)
    }
  </div>
)

function isGifImage(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

function isPngImage(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
}

function isWebpImage(file: File): boolean {
  return file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  )
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

async function isAnimatedPngImage(file: File): Promise<boolean> {
  if (!isPngImage(file)) return false

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasPngSignature(bytes)) return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const chunkLength = view.getUint32(offset)
    const chunkType = readAscii(bytes, offset + 4, 4)
    if (chunkType === 'acTL') return true
    offset += 12 + chunkLength
  }

  return false
}

async function isAnimatedWebpImage(file: File): Promise<boolean> {
  if (!isWebpImage(file)) return false

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4)
    const chunkLength = view.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8

    if (chunkType === 'ANIM') return true
    if (chunkType === 'VP8X' && chunkLength >= 1 && chunkDataOffset < bytes.length) {
      const featureFlags = bytes[chunkDataOffset] ?? 0
      if ((featureFlags & 0x02) !== 0) return true
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2)
  }

  return false
}

async function isAnimatedAvatarImage(file: File): Promise<boolean> {
  return isGifImage(file) || await isAnimatedPngImage(file) || await isAnimatedWebpImage(file)
}

const SettingsAccount = () => {
  const queryClient = useQueryClient()
  const { data: user, isLoading } = useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetchWithAuth('/api/me').then(r => r.json()),
  })

  const [displayName, setDisplayName] = React.useState('')
  const [nameSaved, setNameSaved] = React.useState(false)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName)
  }, [user?.displayName])

  const nameMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? '更新に失敗しました')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    },
  })

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (await isAnimatedAvatarImage(file)) {
        throw new Error('アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください')
      }

      let uploadFile = file
      try {
        uploadFile = (await processImageForUpload(file)).file
      } catch {
        throw new Error('画像の準備に失敗しました。別の写真でお試しください')
      }

      const fd = new FormData()
      fd.append('file', uploadFile)
      const res = await fetchWithAuth('/api/me/avatar', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'アップロードに失敗しました')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
    },
  })

  const aiNudgesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiNudgesEnabled: enabled }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? '更新に失敗しました')
      }
      return enabled
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], current => current
        ? { ...current, aiNudgesEnabled: enabled }
        : current)
      void queryClient.invalidateQueries({ queryKey: ['ai-nudges'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) avatarMutation.mutate(file)
    e.target.value = ''
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7,
    background: 'var(--card-2)', color: 'var(--text)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', flex: 1,
  }

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-4)', fontSize: 13 }}>読み込み中…</div>

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>アカウント</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>プロフィールや通知などの個人設定です。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>プロフィール</h2>
        <div className="card" style={{ padding: 0 }}>

          {/* アバター */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 16px', borderBottom: '1px solid var(--divider)' }}>
            <AvatarCircle url={user?.avatarUrl ?? null} name={user?.displayName ?? ''} size={56}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.displayName}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>プロフィール写真</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>大きい写真は自動で縮小してアップロードします</div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,.heic,image/heif,.heif"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
            <button
              className="btn btn-ghost"
              style={{ height: 30, fontSize: 12, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
            >
              <Icon name="image" size={12}/>
              {avatarMutation.isPending ? 'アップロード中…' : '写真を変更'}
            </button>
          </div>

          {/* 表示名 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>表示名</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>チームメンバーに表示される名前</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && displayName.trim() && nameMutation.mutate()}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                onClick={() => nameMutation.mutate()}
                disabled={nameMutation.isPending || !displayName.trim() || displayName === user?.displayName}
                className="btn btn-primary"
                style={{ height: 32, padding: '0 14px', fontSize: 12.5, flexShrink: 0 }}
              >
                {nameSaved ? '保存済み' : nameMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
          {nameMutation.isError && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(nameMutation.error as Error).message}
            </div>
          )}
          {avatarMutation.isError && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(avatarMutation.error as Error).message}
            </div>
          )}

          {/* メール（読み取り専用） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>メールアドレス</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ログインに使用するアドレス</div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{user?.email ?? '—'}</span>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>通知</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>AI PMO ナッジ</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}>
                期限や停滞について、あなただけに見えるリマインドをチャットに表示します
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={user?.aiNudgesEnabled ?? true}
              aria-label="AI PMO ナッジ"
              disabled={aiNudgesMutation.isPending}
              onClick={() => aiNudgesMutation.mutate(!(user?.aiNudgesEnabled ?? true))}
              style={{ border: 'none', background: 'transparent', padding: 0, flexShrink: 0 }}
            >
              <Toggle on={user?.aiNudgesEnabled ?? true}/>
            </button>
          </div>
          {aiNudgesMutation.isError && (
            <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(aiNudgesMutation.error as Error).message}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const SettingsAppearance = () => {
  const { theme, setTheme } = useTheme()
  const { accentId, setAccentId } = useAccentColor()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>外観</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>テーマやカラーなど、表示に関する個人設定です。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>テーマ・カラー</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>テーマ</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ライト・ダーク・システム設定に従う</div>
            </div>
            {mounted && (
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elev)', borderRadius: 10, padding: 4 }}>
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 7, border: 'none',
                      background: theme === opt.value ? 'var(--card)' : 'transparent',
                      color: theme === opt.value ? 'var(--text)' : 'var(--text-3)',
                      fontWeight: theme === opt.value ? 600 : 500,
                      fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
                      boxShadow: theme === opt.value ? 'var(--shadow-sm)' : 'none',
                      transition: 'all .12s',
                    }}
                  >
                    <Icon name={opt.icon} size={13}/> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>ハイライトカラー</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ボタン・アクティブ状態などのアクセントカラー</div>
            </div>
            {mounted && (
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENT_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    title={preset.label}
                    onClick={() => setAccentId(preset.id)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: preset.swatch, border: 'none', cursor: 'pointer', padding: 0,
                      outline: accentId === preset.id ? `3px solid ${preset.swatch}` : '3px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline .12s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const COLOR_PRESETS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#F43F5E', '#6B7280', '#EF4444', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#14B8A6',
]

async function fetchStatuses(): Promise<ProjectStatusDto[]> {
  const res = await fetchWithAuth('/api/projects/statuses')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectStatusDto[]>
}

const StatusRow = ({
  status,
  onSaved,
  onDeleted,
}: {
  status: ProjectStatusDto
  onSaved: () => void
  onDeleted: () => void
}) => {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(status.name)
  const [color, setColor] = React.useState(status.color)
  const [confirmDel, setConfirmDel] = React.useState(false)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/statuses/${status.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
    },
    onSuccess: () => { setEditing(false); onSaved() },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/statuses/${status.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
    },
    onSuccess: onDeleted,
  })

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: status.color, flexShrink: 0 }}/>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{status.name}</span>
        <RowActionMenu
          actions={[
            { icon: 'edit', label: '編集', onSelect: () => setEditing(true) },
            { icon: 'trash', label: '削除', danger: true, onSelect: () => setConfirmDel(true) },
          ]}
        />
        <ConfirmDialog
          open={confirmDel}
          title="ステータスを削除"
          message={`ステータス「${status.name}」を削除しますか？この操作は取り消せません。`}
          onConfirm={() => deleteMutation.mutateAsync()}
          onClose={() => setConfirmDel(false)}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--card-2)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {COLOR_PRESETS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', padding: 0,
              outline: color === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: 2,
            }}
          />
        ))}
      </div>
      {saveMutation.isError && <div style={{ fontSize: 11.5, color: 'var(--red-text)' }}>⚠ 更新に失敗しました</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ height: 28, fontSize: 12, padding: '0 10px' }} onClick={() => setEditing(false)}>キャンセル</button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          className="btn btn-primary"
          style={{ height: 28, fontSize: 12, padding: '0 12px', opacity: (saveMutation.isPending || !name.trim()) ? 0.6 : 1 }}
        >
          {saveMutation.isPending ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

const SettingsWorkflow = () => {
  const queryClient = useQueryClient()
  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ['statuses'],
    queryFn: fetchStatuses,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['statuses'] })

  const [showAdd, setShowAdd] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newColor, setNewColor] = React.useState('#3B82F6')

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/projects/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!res.ok) throw new Error('追加に失敗しました')
    },
    onSuccess: () => {
      setShowAdd(false)
      setNewName('')
      setNewColor('#3B82F6')
      invalidate()
    },
  })

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>ワークフロー</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>プロジェクトのステータスを管理します。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>ステータス一覧</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>読み込み中…</div>
          ) : (
            statuses.map((s, i) => (
              <div key={s.id} style={{ borderBottom: i < statuses.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <StatusRow status={s} onSaved={invalidate} onDeleted={invalidate}/>
              </div>
            ))
          )}

          {showAdd ? (
            <div style={{ padding: '12px 14px', borderTop: statuses.length > 0 ? '1px solid var(--divider)' : 'none', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--card-2)' }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="ステータス名を入力…"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) addMutation.mutate() }}
                style={{ height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', padding: 0,
                      outline: newColor === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
              {addMutation.isError && <div style={{ fontSize: 11.5, color: 'var(--red-text)' }}>⚠ 追加に失敗しました</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost" style={{ height: 28, fontSize: 12, padding: '0 10px' }} onClick={() => { setShowAdd(false); setNewName('') }}>キャンセル</button>
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending || !newName.trim()}
                  className="btn btn-primary"
                  style={{ height: 28, fontSize: 12, padding: '0 12px', opacity: (addMutation.isPending || !newName.trim()) ? 0.6 : 1 }}
                >
                  {addMutation.isPending ? '追加中…' : '追加'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 10, borderTop: statuses.length > 0 ? '1px solid var(--divider)' : 'none' }}>
              <button
                onClick={() => setShowAdd(true)}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Icon name="plus" size={13}/> ステータスを追加
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const SettingsAI = () => (
  <div style={{ maxWidth: 780 }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>AIエージェント</h1>
    <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>各プロジェクトに常駐するAIアシスタントの動作を設定します。</p>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>モデル</h2>
      <div className="card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { n: 'GPT-5',      d: '高精度・推奨',     on: true },
          { n: 'GPT-5 mini', d: '高速・低コスト', on: false },
        ].map((m, i) => (
          <div key={i} style={{ padding: 12, borderRadius: 8, border: `2px solid ${m.on ? 'var(--accent)' : 'var(--border)'}`, background: m.on ? 'var(--accent-soft)' : 'var(--card-2)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkles" size={14} color={m.on ? 'var(--accent-text)' : 'var(--text-3)'}/>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.n}</span>
              {m.on && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: 'var(--accent-text)' }}>選択中</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{m.d}</div>
          </div>
        ))}
      </div>
    </section>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>動作</h2>
      <div className="card">
        {[
          { l: 'ファイルアップロード時に自動要約', s: 'PDF / XLSX / GPX', on: true },
{ l: 'ダッシュボードに自動サマリー生成', s: '毎日 7:00 / 22:00', on: true },
          { l: '危険情報を検知して通知', s: '天候・遭難情報・装備不足', on: false },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.l}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{r.s}</div>
            </div>
            <Toggle on={r.on}/>
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>システムプロンプト</h2>
      <textarea defaultValue="山岳部の活動を支援するアシスタントとして、安全を最優先に、計画書・装備・気象情報をもとに具体的な提案を行ってください。"
        rows={5} style={{ width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}/>
    </section>
  </div>
)

const SettingsWorkspaceGeneral = () => {
  const queryClient = useQueryClient()
  const { data: wsSettings } = useWorkspaceSettings()
  const updateSettings = useUpdateWorkspaceSettings()
  const { isOwner } = useWorkspacePermissions()
  const readOnly = !isOwner

  const { data: ws } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
  })

  const [wsName, setWsName] = React.useState('')
  const [nameSaved, setNameSaved] = React.useState(false)
  const [wsDesc, setWsDesc] = React.useState('')
  const [descSaved, setDescSaved] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [labelSaved, setLabelSaved] = React.useState(false)
  const logoInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { if (ws?.name) setWsName(ws.name) }, [ws?.name])
  React.useEffect(() => { if (ws !== undefined) setWsDesc(ws.description ?? '') }, [ws?.description])
  React.useEffect(() => { if (wsSettings !== undefined) setLabel(wsSettings.projectLabel ?? '') }, [wsSettings])

  const nameMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? '更新に失敗しました')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    },
  })

  const descMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: wsDesc || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? '更新に失敗しました')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      setDescSaved(true)
      setTimeout(() => setDescSaved(false), 2000)
    },
  })

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetchWithAuth('/api/workspaces/logo', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'アップロードに失敗しました')
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workspace'] }),
  })

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) logoMutation.mutate(file)
    e.target.value = ''
  }

  const handleLabelSave = async () => {
    await updateSettings.mutateAsync({ projectLabel: label })
    setLabelSaved(true)
    setTimeout(() => setLabelSaved(false), 2000)
  }

  const updateAiNudgesEnabled = (phase: 'one' | 'two', enabled: boolean) => {
    void updateSettings.mutateAsync(
      phase === 'one'
        ? { aiNudgesPhaseOneEnabled: enabled }
        : { aiNudgesPhaseTwoEnabled: enabled },
    )
  }

  const phaseOneEnabled = wsSettings?.aiNudgesPhaseOneEnabled ?? true
  const phaseTwoEnabled = wsSettings?.aiNudgesPhaseTwoEnabled ?? false
  const phaseTwoUsage = wsSettings?.aiNudgesPhaseTwoUsage
  const formatTokens = (value: number) => new Intl.NumberFormat('ja-JP').format(value)

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7,
    background: 'var(--card-2)', color: 'var(--text)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>ワークスペース設定</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>ワークスペース全体の表示・動作に関する設定です。</p>

      {readOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', marginBottom: 20, borderRadius: 9,
          background: 'var(--amber-soft, var(--card-2))', border: '1px solid var(--border)',
          color: 'var(--text-2)', fontSize: 12.5,
        }}>
          <Icon name="alertTriangle" size={14}/>
          ワークスペース設定の変更にはオーナー権限が必要です。閲覧のみ可能です。
        </div>
      )}

      {/* ワークスペース情報 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>ワークスペース情報</h2>
        <div className="card" style={{ padding: 0 }}>

          {/* ロゴ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, flexShrink: 0,
              background: ws?.logoUrl ? 'var(--border)' : 'var(--accent)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: ws?.logoUrl ? undefined : 'var(--on-accent)',
            }}>
              {ws?.logoUrl
                ? <img src={ws.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : (ws?.name ? initials(ws.name) : '?')
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ws?.name ?? '—'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ワークスペースのアイコン</div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style={{ display: 'none' }}
              onChange={handleLogoChange}
            />
            <button
              className="btn btn-ghost"
              style={{ height: 30, fontSize: 12, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              onClick={() => logoInputRef.current?.click()}
              disabled={logoMutation.isPending || readOnly}
              title={readOnly ? 'ワークスペース設定の変更にはオーナー権限が必要です' : undefined}
            >
              <Icon name="image" size={12}/>
              {logoMutation.isPending ? 'アップロード中…' : 'アイコンを変更'}
            </button>
          </div>
          {logoMutation.isError && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(logoMutation.error as Error).message}
            </div>
          )}

          {/* ワークスペース名 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>ワークスペース名</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>ナビゲーションに表示される名称</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={wsName}
                onChange={e => setWsName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && wsName.trim() && nameMutation.mutate()}
                readOnly={readOnly}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                onClick={() => nameMutation.mutate()}
                disabled={nameMutation.isPending || !wsName.trim() || wsName === ws?.name || readOnly}
                title={readOnly ? 'ワークスペース設定の変更にはオーナー権限が必要です' : undefined}
                className="btn btn-primary"
                style={{ height: 32, padding: '0 14px', fontSize: 12.5, flexShrink: 0, ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              >
                {nameSaved ? '保存済み' : nameMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
          {nameMutation.isError && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(nameMutation.error as Error).message}
            </div>
          )}

          {/* 説明 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--divider)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>説明</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>組織名・所属など。ナビゲーションのワークスペース名の下に表示されます。</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={wsDesc}
                onChange={e => setWsDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && descMutation.mutate()}
                placeholder="例: 東京工科大学"
                readOnly={readOnly}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                onClick={() => descMutation.mutate()}
                disabled={descMutation.isPending || wsDesc === (ws?.description ?? '') || readOnly}
                title={readOnly ? 'ワークスペース設定の変更にはオーナー権限が必要です' : undefined}
                className="btn btn-primary"
                style={{ height: 32, padding: '0 14px', fontSize: 12.5, flexShrink: 0, ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              >
                {descSaved ? '保存済み' : descMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
          {descMutation.isError && (
            <div style={{ padding: '6px 16px 10px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(descMutation.error as Error).message}
            </div>
          )}
        </div>
      </section>

      {/* 用語のカスタマイズ */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>用語のカスタマイズ</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>プロジェクトの呼び名</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                ナビゲーションやページタイトルに表示される名称。空欄の場合は「プロジェクト」が使われます。
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="プロジェクト"
                readOnly={readOnly}
                style={{ ...inputStyle, width: 160 }}
                onKeyDown={e => e.key === 'Enter' && handleLabelSave()}
              />
              <button
                onClick={handleLabelSave}
                disabled={updateSettings.isPending || readOnly}
                title={readOnly ? 'ワークスペース設定の変更にはオーナー権限が必要です' : undefined}
                className="btn btn-primary"
                style={{ height: 32, padding: '0 14px', fontSize: 12.5, ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              >
                {labelSaved ? '保存済み' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          AI PMO
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700,
            color: 'var(--accent-text)', background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            borderRadius: 999, padding: '1px 7px',
          }}>
            <Icon name="flask" size={11} /> Lab
          </span>
        </h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Phase 1: タスクのリマインダー</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}>
                期限・停滞を毎朝確認するルールベースのリマインダーです。生成AIは使わず、トークンは消費しません。
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={phaseOneEnabled}
              aria-label="Phase 1: タスクのリマインダー"
              disabled={updateSettings.isPending || readOnly}
              title={readOnly ? 'ワークスペース設定の変更にはオーナー権限が必要です' : undefined}
              onClick={() => updateAiNudgesEnabled('one', !phaseOneEnabled)}
              style={{ border: 'none', background: 'transparent', padding: 0, flexShrink: 0, ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            >
              <Toggle on={phaseOneEnabled}/>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Phase 2: チャットのAI巡回</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}>
                チャットの未回答依頼やリスクをAIで分析します。OpenAIのトークンを消費するため、既定ではオフです。
              </div>
              {isOwner && phaseTwoUsage && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  累計: {formatTokens(phaseTwoUsage.totalTokens)} トークン
                  （入力 {formatTokens(phaseTwoUsage.inputTokens)} / 出力 {formatTokens(phaseTwoUsage.outputTokens)}、{formatTokens(phaseTwoUsage.requestCount)} 回）
                </div>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={phaseTwoEnabled}
              aria-label="Phase 2: チャットのAI巡回"
              disabled={updateSettings.isPending || readOnly}
              title={readOnly ? 'ワークスペース設定の変更にはオーナー権限が必要です' : undefined}
              onClick={() => updateAiNudgesEnabled('two', !phaseTwoEnabled)}
              style={{ border: 'none', background: 'transparent', padding: 0, flexShrink: 0, ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            >
              <Toggle on={phaseTwoEnabled}/>
            </button>
          </div>
          {updateSettings.isError && (
            <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(updateSettings.error as Error).message}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const SettingsIntegrations = () => {
  // ── iCal 出力 ──────────────────────────────────────────────────────
  const { data: ws } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
  })
  const { data, refetch } = useQuery<{ token: string }>({
    queryKey: ['ical-token'],
    queryFn: () => fetchWithAuth('/api/calendar/token').then(r => r.json()),
  })
  const regenerate = useMutation({
    mutationFn: () => fetchWithAuth('/api/calendar/token', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => refetch(),
  })
  const [copiedScope, setCopiedScope] = React.useState<string | null>(null)

  const buildUrl = (scope: 'me' | 'workspace') => {
    if (!data?.token || !ws?.id) return ''
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/api/calendar/ical?token=${data.token}&scope=${scope}&workspaceId=${ws.id}`
  }

  const copy = (scope: 'me' | 'workspace') => {
    void navigator.clipboard.writeText(buildUrl(scope))
    setCopiedScope(scope)
    setTimeout(() => setCopiedScope(null), 2000)
  }

  const feeds: { scope: 'me' | 'workspace'; label: string; desc: string }[] = [
    { scope: 'me',        label: '自分が参加しているプロジェクト', desc: 'メンバーとして参加しているプロジェクトの期間のみ' },
    { scope: 'workspace', label: 'ワークスペース全体',             desc: 'ワークスペース内のすべてのプロジェクト期間' },
  ]

  // ── Google カレンダー読み込み ───────────────────────────────────────
  const queryClient = useQueryClient()
  const [gcalMsg, setGcalMsg] = React.useState<{ text: string; ok: boolean } | null>(null)

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gcal = params.get('gcal')
    if (gcal === 'connected') setGcalMsg({ text: 'Google カレンダーと接続しました', ok: true })
    else if (gcal === 'error') setGcalMsg({ text: '接続に失敗しました。再試行してください。', ok: false })
    else if (gcal === 'denied') setGcalMsg({ text: '接続がキャンセルされました。', ok: false })
    if (gcal) {
      const url = new URL(window.location.href)
      url.searchParams.delete('gcal')
      window.history.replaceState({}, '', url.toString())
      setTimeout(() => setGcalMsg(null), 5000)
    }
  }, [])

  const { data: gcalStatus, isLoading: gcalLoading } = useQuery<GcalStatusDto>({
    queryKey: ['gcal-status'],
    queryFn: () => fetchWithAuth('/api/calendar/google/status').then(r => r.json()),
  })

  const {
    data: gcalCalendars,
    isLoading: gcalCalendarsLoading,
    error: gcalCalendarsError,
  } = useQuery<GcalCalendarDto[]>({
    queryKey: ['gcal-calendars'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/calendar/google/calendars')
      const body = await res.json().catch(() => null) as GcalCalendarDto[] | { error?: string; code?: string } | null
      if (!res.ok) {
        throw new GcalCalendarsError(
          (body && !Array.isArray(body) && body.error) || 'Google カレンダー一覧の取得に失敗しました',
          body && !Array.isArray(body) ? body.code : undefined,
        )
      }
      if (!Array.isArray(body)) {
        throw new GcalCalendarsError('Google カレンダー一覧の形式が不正です')
      }
      return body
    },
    enabled: gcalStatus?.connected === true,
  })

  const connectGcal = async () => {
    const res = await fetchWithAuth('/api/calendar/google/connect')
    const { url } = await res.json() as { url?: string; error?: string }
    if (url) window.location.href = url
  }

  const disconnectGcal = useMutation({
    mutationFn: () => fetchWithAuth('/api/calendar/google/disconnect', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gcal-status'] })
      void queryClient.invalidateQueries({ queryKey: ['gcal-calendars'] })
      void queryClient.invalidateQueries({ queryKey: ['gcal-events'] })
    },
  })

  const [calendarSelection, setCalendarSelection] = React.useState<Record<string, boolean>>({})
  const [savingCalendars, setSavingCalendars] = React.useState(false)

  React.useEffect(() => {
    if (!gcalCalendars) return
    const init: Record<string, boolean> = {}
    for (const c of gcalCalendars) init[c.id] = c.selected
    setCalendarSelection(init)
  }, [gcalCalendars])

  const saveCalendarSelection = async () => {
    if (!gcalCalendars) return
    setSavingCalendars(true)
    const selected = gcalCalendars
      .filter(c => calendarSelection[c.id])
      .map(c => ({ id: c.id, name: c.name, color: c.color }))
    await fetchWithAuth('/api/calendar/google/calendars', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedCalendars: selected }),
    })
    void queryClient.invalidateQueries({ queryKey: ['gcal-events'] })
    setSavingCalendars(false)
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>連携</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>外部サービスとの連携を設定します。</p>

      {/* ── iCal 出力セクション ───────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>Cairn → Google カレンダー（iCal 出力）</h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
          URLをコピーして Google カレンダーの「他のカレンダーを追加」→「URLで追加」に貼り付けてください。
        </p>
        <div className="card" style={{ padding: 0 }}>
          {feeds.map((f, i) => (
            <div key={f.scope} style={{ padding: '14px 16px', borderBottom: i === 0 ? '1px solid var(--divider)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>{f.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', minWidth: 0 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                      {data?.token ? buildUrl(f.scope) : '読み込み中…'}
                    </span>
                    <button
                      onClick={() => copy(f.scope)}
                      disabled={!data?.token}
                      className="btn btn-ghost"
                      style={{ height: 26, fontSize: 11.5, padding: '0 8px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Icon name={copiedScope === f.scope ? 'check' : 'copy'} size={12}/>
                      {copiedScope === f.scope ? 'コピー済み' : 'コピー'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>URLを知っている人は誰でもカレンダーを閲覧できます。漏洩した場合は再生成してください。</span>
            <button
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              className="btn btn-ghost"
              style={{ height: 28, fontSize: 12, padding: '0 10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Icon name="refresh" size={12}/> URL を再生成
            </button>
          </div>
        </div>
      </section>

      {/* ── Google カレンダー読み込みセクション ──────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          Google カレンダー → Cairn（イベント読み込み）
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700,
            color: 'var(--accent-text)', background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            borderRadius: 999, padding: '1px 7px',
          }}>
            <Icon name="flask" size={11} /> Lab
          </span>
        </h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
          Google カレンダーの予定をカレンダービューにオーバーレイ表示します。試験的な機能のため、今後仕様が変更される場合があります。
        </p>

        {gcalMsg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12.5,
            background: gcalMsg.ok ? 'var(--emerald-soft)' : 'var(--red-soft)',
            color: gcalMsg.ok ? 'var(--emerald-text)' : 'var(--red-text)',
            border: `1px solid ${gcalMsg.ok ? 'var(--emerald-text)' : 'var(--red-text)'}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name={gcalMsg.ok ? 'check-circle' : 'alert-circle'} size={14}/>
            {gcalMsg.text}
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          {gcalLoading ? (
            <div style={{ padding: '20px 16px', color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>
          ) : !gcalStatus?.configured ? (
            <div style={{ padding: '16px', fontSize: 12.5, color: 'var(--text-3)' }}>
              <Icon name="alert-circle" size={13} style={{ marginRight: 6 }}/>
              環境変数 <code style={{ fontFamily: 'monospace', background: 'var(--card-2)', padding: '1px 4px', borderRadius: 4 }}>GOOGLE_CALENDAR_CLIENT_ID</code> / <code style={{ fontFamily: 'monospace', background: 'var(--card-2)', padding: '1px 4px', borderRadius: 4 }}>GOOGLE_CALENDAR_CLIENT_SECRET</code> が未設定です。
            </div>
          ) : !gcalStatus.connected ? (
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>未接続</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Google アカウントを連携してカレンダーを読み込みます。</div>
              </div>
              <button
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', fontSize: 12.5, flexShrink: 0 }}
                onClick={() => void connectGcal()}
              >
                <Icon name="calendar" size={13}/> Google で接続
              </button>
            </div>
          ) : (
            <>
              {/* 接続済みヘッダー */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--emerald-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={15} color="var(--emerald-text)"/>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>接続済み</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{gcalStatus.email}</div>
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: 'var(--red-text)', height: 28, padding: '0 10px' }}
                  onClick={() => disconnectGcal.mutate()}
                  disabled={disconnectGcal.isPending}
                >
                  接続を解除
                </button>
              </div>

              {/* カレンダー選択 */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10 }}>表示するカレンダー</div>
                {gcalCalendarsLoading ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>読み込み中…</div>
                ) : gcalCalendarsError ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
                      {gcalCalendarsError.message}
                    </div>
                    {(gcalCalendarsError as GcalCalendarsError).code === 'GOOGLE_RECONNECT_REQUIRED' && (
                      <button
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', fontSize: 12.5, flexShrink: 0 }}
                        onClick={() => void connectGcal()}
                      >
                        <Icon name="calendar" size={13}/> Google を再接続
                      </button>
                    )}
                  </div>
                ) : !gcalCalendars ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>Google カレンダー一覧を取得できませんでした。</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {gcalCalendars.map(cal => (
                      <label
                        key={cal.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 0' }}
                      >
                        <input
                          type="checkbox"
                          checked={calendarSelection[cal.id] ?? false}
                          onChange={e => setCalendarSelection(prev => ({ ...prev, [cal.id]: e.target.checked }))}
                          style={{ width: 14, height: 14, accentColor: cal.color, cursor: 'pointer' }}
                        />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cal.color, flexShrink: 0 }}/>
                        <span style={{ fontSize: 13, flex: 1 }}>
                          {cal.name}
                          {cal.primary && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-4)', background: 'var(--card-2)', borderRadius: 4, padding: '1px 5px' }}>メイン</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {gcalCalendars && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    style={{ height: 30, fontSize: 12.5, padding: '0 14px' }}
                    onClick={() => void saveCalendarSelection()}
                    disabled={savingCalendars}
                  >
                    {savingCalendars ? '保存中…' : '保存'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// ─── Billing ──────────────────────────────────────────────────────
// Phase 0（計測）: 制限・課金はまだかけない。ストレージ使用量の計測結果を表示するのみ。
// 詳細: docs/billing-implementation-design.md

import type { WorkspaceStorageUsageDto } from '@/app/api/workspaces/storage-usage/route'

const FREE_TIER_REFERENCE_GB = 10

const SettingsBilling = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspace-storage-usage'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/workspaces/storage-usage')
      if (!res.ok) throw new Error('取得に失敗しました')
      return res.json() as Promise<WorkspaceStorageUsageDto>
    },
  })

  const totalGb = (data?.originalBytes ?? 0) / 1024 ** 3
  const ratio = Math.min(1, totalGb / FREE_TIER_REFERENCE_GB)

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>請求</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        課金機能は準備中です。現在はストレージ使用量を計測しているのみで、上限は設けていません。
      </p>

      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>ストレージ使用量</h2>
        {isLoading ? (
          <div style={{ color: 'var(--text-4)', fontSize: 13 }}>読み込み中…</div>
        ) : isError ? (
          // 取得失敗を 0GB として偽装しない（バックエンド/マイグレーション不備を隠さないため）
          <div style={{ fontSize: 13, color: 'var(--red-text)' }}>⚠ ストレージ使用量を取得できませんでした</div>
        ) : (
          <>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--card-2)', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${ratio * 100}%`, background: 'var(--accent)', borderRadius: 4 }}/>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {totalGb.toFixed(2)} GB 使用中（参考ライン: {FREE_TIER_REFERENCE_GB} GB）
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ─── Developer ────────────────────────────────────────────────────

import type { DevStatusDto, ServiceStatus } from '@/app/api/dev/status/route'

const STATUS_CONFIG: Record<ServiceStatus['status'], { label: string; color: string; bg: string }> = {
  ok:           { label: '接続済み',  color: 'var(--emerald-text)', bg: 'var(--emerald-soft)' },
  error:        { label: 'エラー',    color: 'var(--red-text)',     bg: 'var(--red-soft)' },
  unconfigured: { label: '未設定',    color: 'var(--text-4)',       bg: 'var(--card-2)' },
}

const MANUAL_OK_STATUS = { label: '未確認', color: 'var(--text-4)', bg: 'var(--card-2)' }

function getStatusBadgeConfig(status: ServiceStatus, hasLiveDiagnostic: boolean) {
  if (status.status !== 'ok') return STATUS_CONFIG[status.status]
  return hasLiveDiagnostic ? STATUS_CONFIG.ok : MANUAL_OK_STATUS
}

function getStatusBadgeLabel(status: ServiceStatus, hasLiveDiagnostic: boolean) {
  return getStatusBadgeConfig(status, hasLiveDiagnostic).label
}

type ServiceKey = Exclude<keyof DevStatusDto, 'env'>
const SERVICE_META: { key: ServiceKey; label: string; icon: string; purpose: string }[] = [
  { key: 'supabaseDb',      label: 'Supabase Database',   icon: 'database',  purpose: 'プロジェクト・タスク・メッセージなど全データの永続化に必要' },
  { key: 'supabaseStorage', label: 'Supabase Storage',    icon: 'archive',   purpose: 'カバー写真・ギャラリー画像・添付ファイルの保存に必要' },
  { key: 'inngest',         label: 'Inngest',              icon: 'sparkles',  purpose: 'AI エージェント・通知・外部連携などの非同期ジョブ実行に必要' },
  { key: 'openai',          label: 'OpenAI',               icon: 'sparkles',  purpose: 'AI アシスタント・ドキュメント要約・ベクトル検索に必要' },
  { key: 'googleMaps',      label: 'Google Maps Platform', icon: 'map-pin',   purpose: 'プロジェクト作成時の場所オートコンプリートとカバー写真取得に必要' },
  { key: 'tavily',          label: 'Tavily',               icon: 'search',    purpose: 'AI エージェントのウェブ検索機能に必要（省略可）' },
]

const SettingsDeveloper = () => {
  const { isOwner } = useWorkspacePermissions()
  const { data: staticData, isLoading } = useQuery<DevStatusDto>({
    queryKey: ['dev-status'],
    queryFn: () => fetchWithAuth('/api/dev/status').then(r => r.json()),
    staleTime: 0,
    gcTime: 0,
  })
  const [diagnosticData, setDiagnosticData] = React.useState<DevStatusDto | null>(null)
  const diagnose = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/dev/status', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? '診断の実行に失敗しました')
      }
      return res.json() as Promise<DevStatusDto>
    },
    onSuccess: (next) => setDiagnosticData(next),
  })

  const data = diagnosticData ?? staticData
  const hasLiveDiagnostic = diagnosticData != null

  if (!isOwner) {
    return (
      <div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>開発者情報</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>このセクションはワークスペースのオーナーのみ利用できます。</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', flex: 1 }}>開発者情報</h1>
        <button
          className="btn"
          onClick={() => void diagnose.mutateAsync()}
          disabled={diagnose.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
        >
          <Icon name="refresh" size={13} style={diagnose.isPending ? { animation: 'spin 1s linear infinite' } : {}}/>
          手動診断
        </button>
      </div>
      <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 10 }}>初期表示は設定状況のみを表示し、外部サービスへの疎通確認は手動診断時にだけ実行されます。</p>
      {diagnose.error && (
        <p style={{ color: 'var(--red-text)', fontSize: 12.5, margin: '0 0 18px' }}>
          {diagnose.error instanceof Error ? diagnose.error.message : '診断の実行に失敗しました'}
        </p>
      )}
      {!diagnose.data && (
        <p style={{ color: 'var(--text-4)', fontSize: 12, margin: '0 0 28px' }}>OpenAI などの実接続確認は「手動診断」でのみ行います。</p>
      )}

      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>外部サービス</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {SERVICE_META.map(({ key, label, icon, purpose }) => {
            const s = data?.[key]
            const cfg = s ? getStatusBadgeConfig(s, hasLiveDiagnostic) : null
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--card)', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={icon} size={15} color="var(--text-3)"/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>{purpose}</div>
                  {s?.detail && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{s.detail}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {s?.latencyMs != null && s.status === 'ok' && (
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{s.latencyMs}ms</span>
                  )}
                  {isLoading ? (
                    <span style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '3px 10px', borderRadius: 999, background: 'var(--card-2)' }}>確認中...</span>
                  ) : cfg && s ? (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: cfg.color, padding: '3px 10px', borderRadius: 999, background: cfg.bg }}>
                      {getStatusBadgeLabel(s, hasLiveDiagnostic)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '3px 10px', borderRadius: 999, background: 'var(--card-2)' }}>-</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {data?.env && (
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>環境変数</div>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[
              { label: 'NODE_ENV',      value: data.env.nodeEnv },
              { label: 'VAPID',         value: data.env.hasVapid  ? '設定済み' : '未設定（Push 通知無効）' },
            ].map(({ label, value }, i, arr) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--card)', borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', width: 140, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function getSettingsNavGroups(isOwner: boolean): { label: string; items: SettingsSectionMeta[] }[] {
  return [
    {
      label: '個人',
      items: [
        { id: 'account', label: 'アカウント', icon: 'user' },
        { id: 'appearance', label: '外観', icon: 'sun' },
      ],
    },
    {
      label: 'ワークスペース',
      items: [
        { id: 'general', label: 'ワークスペース設定', icon: 'settings' },
        { id: 'workflow', label: 'ワークフロー', icon: 'flag' },
        { id: 'ai', label: 'AIエージェント', icon: 'sparkles' },
        { id: 'members', label: 'メンバー', icon: 'users' },
        { id: 'integrations', label: '連携', icon: 'layers' },
        { id: 'billing', label: '請求', icon: 'archive' },
      ],
    },
    ...(isOwner
      ? [{
        label: '開発者',
        items: [
          { id: 'developer', label: '開発者情報', icon: 'code' },
        ],
      }]
      : []),
  ]
}

export interface SettingsSectionMeta {
  id: string
  label: string
  icon: string
}

// セクションIDごとのメインカラムコンポーネント。未実装のものは準備中プレースホルダーを出す。
const SETTINGS_SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  account:      SettingsAccount,
  appearance:   SettingsAppearance,
  general:      SettingsWorkspaceGeneral,
  workflow:     SettingsWorkflow,
  ai:           SettingsAI,
  integrations: SettingsIntegrations,
  billing:      SettingsBilling,
  developer:    SettingsDeveloper,
}

const DEFAULT_SECTION = 'account'

export function isSettingsSection(id: string | null | undefined, isOwner = true): id is string {
  return id != null && new Set(getSettingsNavGroups(isOwner).flatMap(g => g.items.map(i => i.id))).has(id)
}

export function settingsSectionLabel(id: string, isOwner = true): string {
  for (const g of getSettingsNavGroups(isOwner)) {
    const item = g.items.find(i => i.id === id)
    if (item) return item.label
  }
  return '設定'
}

// セクションのメインカラム本体（PC・モバイル共通）。
export function SettingsSectionContent({ section }: { section: string }) {
  const Comp = SETTINGS_SECTION_COMPONENTS[section]
  if (Comp) return <Comp/>
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {settingsSectionLabel(section)}
      </h1>
      <p style={{ color: 'var(--text-3)', fontSize: 13 }}>このセクションの設定は準備中です。</p>
    </div>
  )
}

export const PageSettings = () => {
  const pathname = usePathname()
  const router = useRouter()
  const { isOwner } = useWorkspacePermissions()
  const navGroups = getSettingsNavGroups(isOwner)
  const seg = pathname.split('/')[2]
  const section = isSettingsSection(seg, isOwner) ? seg : DEFAULT_SECTION
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopBar title="設定"/>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 220, borderRight: '1px solid var(--border)', padding: '20px 14px', background: 'var(--card)' }}>
        {navGroups.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: gi < navGroups.length - 1 ? 16 : 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 10px', marginBottom: 4 }}>
              {group.label}
            </div>
            {group.items.map(s => (
              <button key={s.id} onClick={() => router.push(`/settings/${s.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', borderRadius: 7, border: 'none',
                background: section === s.id ? 'var(--card-hover)' : 'transparent',
                color: section === s.id ? 'var(--text)' : 'var(--text-2)',
                fontWeight: section === s.id ? 600 : 500,
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              }}>
                <Icon name={s.icon} size={14}/> {s.label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
        <SettingsSectionContent section={section}/>
      </div>
      </div>
    </div>
  )
}
