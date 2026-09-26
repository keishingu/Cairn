'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { ConfirmDialog } from '../confirm-dialog'
import { RowActionMenu } from '../row-action-menu'
import { TopBar } from '../sidebar'
import { useAccentColor } from '@/components/accent-color-provider'
import { useLocale, useT } from '@/components/locale-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from '@/lib/use-workspace-settings'
import {
  CURRENT_USER_FETCH_ERROR_MESSAGE,
  invalidateCurrentUserProfile,
  patchCurrentUserCache,
  useCurrentUser,
  useWorkspacePermissions,
} from '@/hooks/use-current-user'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { processImageForUpload } from '@/lib/process-image'
import { toast } from '@/lib/toast'
import type { GcalStatusDto } from '@/app/api/calendar/google/status/route'
import type { GcalCalendarDto } from '@/app/api/calendar/google/calendars/route'
import type { ApiTokenDto } from '@/app/api/api-tokens/route'
import type { McpOAuthConnectionDto } from '@/app/api/oauth/connections/route'
import {
  DEFAULT_CALENDAR_WEEK_START,
  FEATURE_FLAGS,
  formatAppDate,
  isCalendarWeekStart,
  type AccentId,
  type CalendarWeekStart,
  type LocalePreference,
} from '@cairn/shared'
import { writeStoredCalendarWeekStart } from '@/lib/calendar-week-start'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { LoginMethodsSettings } from '../login-methods-settings'
import { ProfileAttributesSettings } from '../profile-attributes-settings'
import { SettingsProjectRoles } from '../settings-project-roles'

const CreditPlacementBoard = dynamic(
  () =>
    import('@/components/billing/credit-placement-board').then(
      (module) => module.CreditPlacementBoard,
    ),
  { ssr: false },
)

class GcalCalendarsError extends Error {
  code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'GcalCalendarsError'
    this.code = code
  }
}

const Toggle = ({ on }: { on: boolean }) => (
  <div
    style={{
      width: 36,
      height: 20,
      borderRadius: 999,
      padding: 2,
      background: on ? 'var(--accent)' : 'var(--border-2)',
      transition: 'background .15s',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: on ? 'flex-end' : 'flex-start',
    }}
  >
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }}
    />
  </div>
)

type ThemeValue = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
]

const LEGAL_SUPPORT_LINKS = [
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Private inquiry', href: 'https://moru.tech/#consultation' },
]

const SettingsSafety = () => {
  const t = useT()
  const queryClient = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ['user-blocks'], queryFn: async () => {
    const res = await fetchWithAuth('/api/me/blocks')
    if (!res.ok) throw new Error(t('Could not load blocked users'))
    return res.json() as Promise<Array<{ userId: string; displayName: string }>>
  }})
  const unblock = useMutation({ mutationFn: async (userId: string) => {
    const res = await fetchWithAuth(`/api/me/blocks/${userId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(t('Could not unblock the user'))
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-blocks'] }) })
  return <div style={{ maxWidth: 780 }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>{t('Safety and support')}</h1>
    <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>{t('Manage blocked users and legal or contact links.')}</p>
    <section style={{ marginBottom: 24 }}><h2 style={{ fontSize: 14 }}>{t('Blocked users')}</h2><div className="card" style={{ padding: 0 }}>{isLoading ? <div style={{ padding: 16 }}>{t('Loading...')}</div> : data.length === 0 ? <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 13 }}>{t('You have not blocked anyone.')}</div> : data.map(user => <div key={user.userId} style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ flex: 1 }}>{user.displayName}</span><button className="btn" onClick={() => unblock.mutate(user.userId)}>{t('Unblock')}</button></div>)}</div></section>
    <section><h2 style={{ fontSize: 14 }}>{t('Legal and support')}</h2><div className="card" style={{ padding: 0 }}>{LEGAL_SUPPORT_LINKS.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '12px 16px', borderBottom: '1px solid var(--divider)', color: 'var(--accent)' }}>{t(link.label)}</a>)}</div></section>
  </div>
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const AvatarCircle = ({
  url,
  name,
  size = 64,
}: {
  url?: string | null
  name: string
  size?: number
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: url ? 'var(--border)' : 'var(--accent)',
      flexShrink: 0,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.35,
      fontWeight: 700,
      color: url ? undefined : 'var(--on-accent)',
    }}
  >
    {url ? (
      <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    ) : (
      initials(name)
    )}
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
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
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
  return isGifImage(file) || (await isAnimatedPngImage(file)) || (await isAnimatedWebpImage(file))
}

// アカウント削除 API は確認文字列「削除」を要求する。
const DELETE_ACCOUNT_CONFIRMATION_WORD = '削除'

const SettingsAccount = () => {
  const t = useT()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data: user, isLoading, isError } = useCurrentUser()

  const [displayName, setDisplayName] = React.useState('')
  const [nameSaved, setNameSaved] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = React.useState('')
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName)
  }, [user?.displayName])

  const nameMutation = useMutation({
    mutationFn: async () => {
      const nextName = displayName.trim()
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: nextName }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? t('Could not update'))
      }
      return nextName
    },
    onSuccess: (nextName) => {
      patchCurrentUserCache(queryClient, { displayName: nextName })
      void invalidateCurrentUserProfile(queryClient)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    },
  })

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (await isAnimatedAvatarImage(file)) {
        throw new Error(
          t('Animated avatars are not supported. Choose a still JPEG / PNG / WebP / HEIC image'),
        )
      }

      let uploadFile = file
      try {
        uploadFile = (await processImageForUpload(file)).file
      } catch {
        throw new Error(t('Could not prepare the image. Try another photo'))
      }

      const fd = new FormData()
      fd.append('file', uploadFile)
      const res = await fetchWithAuth('/api/me/avatar', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? t('Could not upload'))
      }
      const body = (await res.json().catch(() => ({}))) as { avatarUrl?: string }
      return body.avatarUrl ?? null
    },
    onSuccess: (avatarUrl) => {
      if (avatarUrl) patchCurrentUserCache(queryClient, { avatarUrl })
      void invalidateCurrentUserProfile(queryClient)
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
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? t('Could not update'))
      }
      return enabled
    },
    onSuccess: (enabled) => {
      patchCurrentUserCache(queryClient, { aiNudgesEnabled: enabled })
      void queryClient.invalidateQueries({ queryKey: ['ai-nudges'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/me/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          workspaces?: { name: string }[]
        }
        const workspaceNames = data.workspaces?.map((workspace) => workspace.name).join('、')
        throw new Error(
          workspaceNames
            ? t('{reason} Targets: {names}', { reason: data.error ?? t('Could not delete the account'), names: workspaceNames })
            : (data.error ?? t('Could not delete the account')),
        )
      }
    },
    onSuccess: async () => {
      const nativeBridge = (
        window as typeof window & {
          ReactNativeWebView?: { postMessage: (message: string) => void }
        }
      ).ReactNativeWebView
      nativeBridge?.postMessage(JSON.stringify({ type: 'account-deleted' }))

      // Authユーザー削除後でもsupabase-jsは404/401を無視してローカル保存を消す。
      await createSupabaseClient()
        .auth.signOut({ scope: 'local' })
        .catch(() => undefined)
      router.replace('/auth/login?accountDeleted=1')
    },
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) avatarMutation.mutate(file)
    e.target.value = ''
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--card-2)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    flex: 1,
  }

  if (isLoading)
    return <div style={{ padding: 40, color: 'var(--text-4)', fontSize: 13 }}>{t('Loading...')}</div>
  if (isError)
    return (
      <div style={{ padding: 40, color: 'var(--red-text)', fontSize: 13 }}>
        {CURRENT_USER_FETCH_ERROR_MESSAGE}
      </div>
    )

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {t('Account')}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        {t('Personal settings such as your profile and notifications.')}
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Profile')}</h2>
        <div className="card" style={{ padding: 0 }}>
          {/* アバター */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 16px',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            <AvatarCircle url={user?.avatarUrl ?? null} name={user?.displayName ?? ''} size={56} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.displayName}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {t('Profile photo')}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
                {t('Large photos are resized automatically before upload')}
              </div>
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
              style={{
                height: 30,
                fontSize: 12,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
            >
              <Icon name="image" size={12} />
              {avatarMutation.isPending ? t('Uploading…') : t('Change photo')}
            </button>
          </div>

          {/* 表示名 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t('Display name')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {t('The name shown to your team')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && displayName.trim() && nameMutation.mutate()}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                onClick={() => nameMutation.mutate()}
                disabled={
                  nameMutation.isPending || !displayName.trim() || displayName === user?.displayName
                }
                className="btn btn-primary"
                style={{ height: 32, padding: '0 14px', fontSize: 12.5, flexShrink: 0 }}
              >
                {nameSaved ? t('Saved') : nameMutation.isPending ? t('Saving...') : t('Save')}
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Email')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {t('The address used to sign in')}
              </div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{user?.email ?? '—'}</span>
          </div>
        </div>
      </section>

      <LoginMethodsSettings />

      {FEATURE_FLAGS.aiPmo && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Notifications')}</h2>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t('AI PMO nudges')}</div>
                <div
                  style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}
                >
                  {t('Shows reminders only you can see in chat about due dates and stalled work')}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={user?.aiNudgesEnabled ?? true}
                aria-label={t('AI PMO nudges')}
                disabled={aiNudgesMutation.isPending}
                onClick={() => aiNudgesMutation.mutate(!(user?.aiNudgesEnabled ?? true))}
                style={{ border: 'none', background: 'transparent', padding: 0, flexShrink: 0 }}
              >
                <Toggle on={user?.aiNudgesEnabled ?? true} />
              </button>
            </div>
            {aiNudgesMutation.isError && (
              <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--red-text)' }}>
                ⚠ {(aiNudgesMutation.error as Error).message}
              </div>
            )}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Dangerous actions')}</h2>
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red-text)' }}>
                {t('Delete account')}
              </div>
              <div
                style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.6 }}
              >
                {t('Deletes your sign-in details and personal data, and removes you from every workspace.')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              style={{ minHeight: 44, padding: '0 14px', flexShrink: 0 }}
              onClick={() => {
                setDeleteConfirmation('')
                setDeleteDialogOpen(true)
              }}
            >
              {t('Delete account')}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={deleteDialogOpen}
        title={t('Delete your account permanently?')}
        confirmLabel={t('Delete permanently')}
        busyLabel={t('Deleting...')}
        confirmDisabled={deleteConfirmation !== DELETE_ACCOUNT_CONFIRMATION_WORD}
        onClose={() => {
          setDeleteDialogOpen(false)
          setDeleteConfirmation('')
        }}
        onConfirm={() => deleteAccountMutation.mutateAsync()}
        message={
          <div>
            <p style={{ margin: '0 0 8px' }}>
              {t('This cannot be undone. Your sign-in details, profile, integrations, and notification destinations will be deleted, and you will lose access to every workspace.')}
            </p>
            <p style={{ margin: '0 0 12px' }}>
              {t('Messages, photos, attachments, and comments you posted are also deleted. Shared work such as projects and tasks is kept under an unidentifiable “Deleted user” name. Active support subscriptions stop automatically.')}
            </p>
            <label
              htmlFor="delete-account-confirmation"
              style={{ display: 'block', fontWeight: 700 }}
            >
              {t('Type "{word}" to confirm', { word: DELETE_ACCOUNT_CONFIRMATION_WORD })}
            </label>
            <input
              id="delete-account-confirmation"
              aria-label={t('Confirm account deletion')}
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              disabled={deleteAccountMutation.isPending}
              style={{
                ...inputStyle,
                boxSizing: 'border-box',
                width: '100%',
                minHeight: 42,
                marginTop: 6,
              }}
            />
          </div>
        }
      />

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Legal and support')}</h2>
        <div className="card" style={{ padding: 0 }}>
          {LEGAL_SUPPORT_LINKS.map((item, index, items) => (
            <a
              key={item.href}
              href={item.href}
              target={item.href.startsWith('http') ? '_blank' : undefined}
              rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
              style={{
                minHeight: 46,
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: index < items.length - 1 ? '1px solid var(--divider)' : undefined,
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {t(item.label)}
              <span aria-hidden="true" style={{ color: 'var(--text-4)' }}>
                →
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}

const WEEK_START_OPTIONS: { value: CalendarWeekStart; label: string }[] = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
]

const SettingsAppearance = () => {
  const t = useT()
  const { theme, setTheme } = useTheme()
  const { accentId, setAccentId } = useAccentColor()
  const { preference, setPreference } = useLocale()
  const { data: me, isSuccess: meLoaded } = useCurrentUser()
  const queryClient = useQueryClient()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const weekStart = isCalendarWeekStart(me?.calendarWeekStart)
    ? me.calendarWeekStart
    : DEFAULT_CALENDAR_WEEK_START

  const appearanceMutation = useMutation({
    mutationFn: async (patch: {
      theme?: ThemeValue
      accentId?: AccentId
      locale?: LocalePreference
      calendarWeekStart?: CalendarWeekStart
    }) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) { throw new Error(patch.locale ? 'Could not save the language. Check your connection and try again.' : 'Could not save appearance. Check your connection and try again.')
      }
      return patch
    },
    onSuccess: (patch) => {
      patchCurrentUserCache(queryClient, patch)

      // WebView内で変更したときは、再読込を待たずネイティブの配色と言語も更新する。
      const nativeBridge = (
        window as typeof window & {
          ReactNativeWebView?: { postMessage: (message: string) => void }
        }
      ).ReactNativeWebView
      if (patch.locale) {
        nativeBridge?.postMessage(JSON.stringify({ type: 'locale-changed', locale: patch.locale }))
        return
      }
      nativeBridge?.postMessage(
        JSON.stringify({
          type: 'appearance-changed',
          theme: patch.theme ?? theme ?? 'system',
          accentId: patch.accentId ?? accentId,
        }),
      )
    },
  })

  const changeTheme = (value: ThemeValue) => {
    if (appearanceMutation.isPending) return
    const previous = (theme ?? 'system') as ThemeValue
    setTheme(value)
    appearanceMutation.mutate({ theme: value }, { onError: () => setTheme(previous) })
  }

  const changeAccent = (value: AccentId) => {
    if (appearanceMutation.isPending) return
    const previous = accentId
    setAccentId(value)
    appearanceMutation.mutate({ accentId: value }, { onError: () => setAccentId(previous) })
  }

  const changeLocale = (value: LocalePreference) => {
    if (appearanceMutation.isPending) return
    const previous = preference
    patchCurrentUserCache(queryClient, { locale: value })
    setPreference(value)
    appearanceMutation.mutate(
      { locale: value },
      {
        onError: () => {
          patchCurrentUserCache(queryClient, { locale: previous })
          setPreference(previous)
        },
      },
    )
  }

  const changeWeekStart = (value: CalendarWeekStart) => {
    if (!meLoaded || appearanceMutation.isPending || value === weekStart) return
    const previous = weekStart
    patchCurrentUserCache(queryClient, { calendarWeekStart: value })
    writeStoredCalendarWeekStart(value)
    appearanceMutation.mutate(
      { calendarWeekStart: value },
      {
        onError: () => {
          patchCurrentUserCache(queryClient, { calendarWeekStart: previous })
          writeStoredCalendarWeekStart(previous)
        },
      },
    )
  }

  const localeOptions: { value: LocalePreference; label: string }[] = [
    { value: 'system', label: t('Browser') },
    { value: 'ja', label: '日本語' },
    { value: 'en', label: 'English' },
    { value: 'ko', label: '한국어' },
  ]

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('Appearance')}</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>{t('Personal display settings such as language, theme, color, and calendar.')}</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Theme and color')}</h2>
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 16px',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Language')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{t('Choose the language used in the app.')}</div>
            </div>
            {mounted && (
              <div
                role="group"
                aria-label={t('Language')}
                style={{
                  display: 'flex',
                  gap: 4,
                  background: 'var(--bg-elev)',
                  borderRadius: 10,
                  padding: 4,
                }}
              >
                {localeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => changeLocale(opt.value)}
                    disabled={appearanceMutation.isPending}
                    aria-pressed={preference === opt.value}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 7,
                      border: 'none',
                      background: preference === opt.value ? 'var(--card)' : 'transparent',
                      color: preference === opt.value ? 'var(--text)' : 'var(--text-3)',
                      fontWeight: preference === opt.value ? 600 : 500,
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      boxShadow: preference === opt.value ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 16px',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Theme')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{t('Light, dark, or match the system')}</div>
            </div>
            {mounted && (
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  background: 'var(--bg-elev)',
                  borderRadius: 10,
                  padding: 4,
                }}
              >
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => changeTheme(opt.value)}
                    disabled={appearanceMutation.isPending}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 7,
                      border: 'none',
                      background: theme === opt.value ? 'var(--card)' : 'transparent',
                      color: theme === opt.value ? 'var(--text)' : 'var(--text-3)',
                      fontWeight: theme === opt.value ? 600 : 500,
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      boxShadow: theme === opt.value ? 'var(--shadow-sm)' : 'none',
                      transition: 'all .12s',
                    }}
                  >
                    <Icon name={opt.icon} size={13} /> {t(opt.label)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Highlight color')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{t('Accent color for buttons and active states')}</div>
            </div>
            {mounted && (
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    title={t(preset.label)}
                    onClick={() => changeAccent(preset.id)}
                    disabled={appearanceMutation.isPending}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: preset.swatch,
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      outline:
                        accentId === preset.id
                          ? `3px solid ${preset.swatch}`
                          : '3px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline .12s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {appearanceMutation.isError && (
            <div
              style={{
                padding: '8px 16px',
                borderTop: '1px solid var(--divider)',
                color: 'var(--red-text)',
                fontSize: 12,
              }}
            >
              {t(appearanceMutation.error instanceof Error ? appearanceMutation.error.message : 'Could not save appearance. Check your connection and try again.')}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Calendar')}</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Week start')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {t('Start month and week views on Sunday or Monday.')}
              </div>
            </div>
            {mounted && (
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  background: 'var(--bg-elev)',
                  borderRadius: 10,
                  padding: 4,
                }}
              >
                {WEEK_START_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={weekStart === opt.value}
                    onClick={() => changeWeekStart(opt.value)}
                    disabled={!meLoaded || appearanceMutation.isPending}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 7,
                      border: 'none',
                      background: weekStart === opt.value ? 'var(--card)' : 'transparent',
                      color: weekStart === opt.value ? 'var(--text)' : 'var(--text-3)',
                      fontWeight: weekStart === opt.value ? 600 : 500,
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      boxShadow: weekStart === opt.value ? 'var(--shadow-sm)' : 'none',
                      transition: 'all .12s',
                    }}
                  >
                    {t(opt.label)}
                  </button>
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
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#F43F5E',
  '#6B7280',
  '#EF4444',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#14B8A6',
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
  const t = useT()
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
      if (!res.ok) throw new Error(t('Could not update'))
    },
    onSuccess: () => {
      setEditing(false)
      onSaved()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/statuses/${status.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('Could not delete'))
    },
    onSuccess: onDeleted,
  })

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: status.color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{status.name}</span>
        <RowActionMenu
          actions={[
            { icon: 'edit', label: t('Edit'), onSelect: () => setEditing(true) },
            { icon: 'trash', label: t('Delete'), danger: true, onSelect: () => setConfirmDel(true) },
          ]}
        />
        <ConfirmDialog
          open={confirmDel}
          title={t('Delete status')}
          message={t('Delete the status "{name}"? This cannot be undone.', { name: status.name })}
          onConfirm={() => deleteMutation.mutateAsync()}
          onClose={() => setConfirmDel(false)}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--card-2)',
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            flex: 1,
            height: 32,
            padding: '0 10px',
            border: '1px solid var(--border)',
            borderRadius: 7,
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 12.5,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: c,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              outline: color === c ? `3px solid ${c}` : '3px solid transparent',
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
      {saveMutation.isError && (
        <div style={{ fontSize: 11.5, color: 'var(--red-text)' }}>⚠ {t('Could not update')}</div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-ghost"
          style={{ height: 28, fontSize: 12, padding: '0 10px' }}
          onClick={() => setEditing(false)}
        >
          {t('Cancel')}
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          className="btn btn-primary"
          style={{
            height: 28,
            fontSize: 12,
            padding: '0 12px',
            opacity: saveMutation.isPending || !name.trim() ? 0.6 : 1,
          }}
        >
          {saveMutation.isPending ? t('Saving...') : t('Save')}
        </button>
      </div>
    </div>
  )
}

const SettingsWorkflow = () => {
  const t = useT()
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
      if (!res.ok) throw new Error(t('Could not add'))
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
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {t('Workflow')}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        {t('Manage project statuses.')}
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Status list')}</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              {t('Loading...')}
            </div>
          ) : (
            statuses.map((s, i) => (
              <div
                key={s.id}
                style={{
                  borderBottom: i < statuses.length - 1 ? '1px solid var(--divider)' : 'none',
                }}
              >
                <StatusRow status={s} onSaved={invalidate} onDeleted={invalidate} />
              </div>
            ))
          )}

          {showAdd ? (
            <div
              style={{
                padding: '12px 14px',
                borderTop: statuses.length > 0 ? '1px solid var(--divider)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: 'var(--card-2)',
              }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('Enter a status name...')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) addMutation.mutate()
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: c,
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      outline: newColor === c ? `3px solid ${c}` : '3px solid transparent',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
              {addMutation.isError && (
                <div style={{ fontSize: 11.5, color: 'var(--red-text)' }}>⚠ {t('Could not add')}</div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-ghost"
                  style={{ height: 28, fontSize: 12, padding: '0 10px' }}
                  onClick={() => {
                    setShowAdd(false)
                    setNewName('')
                  }}
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending || !newName.trim()}
                  className="btn btn-primary"
                  style={{
                    height: 28,
                    fontSize: 12,
                    padding: '0 12px',
                    opacity: addMutation.isPending || !newName.trim() ? 0.6 : 1,
                  }}
                >
                  {addMutation.isPending ? t('Adding...') : t('Add')}
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 10,
                borderTop: statuses.length > 0 ? '1px solid var(--divider)' : 'none',
              }}
            >
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px dashed var(--border-2)',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Icon name="plus" size={13} /> {t('Add status')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const SettingsAI = () => {
  const t = useT()
  return (
  <div style={{ maxWidth: 780 }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
      {t('AI agent')}
    </h1>
    <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
      {t('Configure the AI assistant that stays with each project.')}
    </p>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Model')}</h2>
      <div
        className="card"
        style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
      >
        {[
          { n: 'GPT-5', d: t('High accuracy, recommended'), on: true },
          { n: 'GPT-5 mini', d: t('Fast and lower cost'), on: false },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              padding: 12,
              borderRadius: 8,
              border: `2px solid ${m.on ? 'var(--accent)' : 'var(--border)'}`,
              background: m.on ? 'var(--accent-soft)' : 'var(--card-2)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon
                name="sparkles"
                size={14}
                color={m.on ? 'var(--accent-text)' : 'var(--text-3)'}
              />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.n}</span>
              {m.on && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--accent-text)',
                  }}
                >
                  {t('Selected')}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{m.d}</div>
          </div>
        ))}
      </div>
    </section>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Behavior')}</h2>
      <div className="card">
        {[
          { l: t('Summarize files automatically on upload'), s: 'PDF / XLSX / GPX', on: true },
          { l: t('Generate a dashboard summary automatically'), s: t('Daily at 7:00 / 22:00'), on: true },
          { l: t('Detect hazards and notify'), s: t('Weather, distress reports, and missing gear'), on: false },
        ].map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderBottom: i < 3 ? '1px solid var(--divider)' : 'none',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.l}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{r.s}</div>
            </div>
            <Toggle on={r.on} />
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('System prompt')}</h2>
      <textarea
        defaultValue={t('As an assistant for alpine club activities, put safety first and make specific suggestions from plans, gear, and weather.')}
        rows={5}
        style={{
          width: '100%',
          padding: 12,
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--card)',
          color: 'var(--text)',
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          outline: 'none',
        }}
      />
    </section>
  </div>
  )
}

const SettingsWorkspaceGeneral = () => {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: wsSettings } = useWorkspaceSettings()
  const updateSettings = useUpdateWorkspaceSettings()
  const { isOwner } = useWorkspacePermissions()
  const readOnly = !isOwner

  const { data: ws } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then((r) => r.json()),
  })

  const [wsName, setWsName] = React.useState('')
  const [nameSaved, setNameSaved] = React.useState(false)
  const [wsDesc, setWsDesc] = React.useState('')
  const [descSaved, setDescSaved] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [labelSaved, setLabelSaved] = React.useState(false)
  const logoInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (ws?.name) setWsName(ws.name)
  }, [ws?.name])
  React.useEffect(() => {
    if (ws !== undefined) setWsDesc(ws.description ?? '')
  }, [ws?.description])
  React.useEffect(() => {
    if (wsSettings !== undefined) setLabel(wsSettings.projectLabel ?? '')
  }, [wsSettings])

  const nameMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? t('Could not update'))
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
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? t('Could not update'))
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
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? t('Could not upload'))
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
      phase === 'one' ? { aiNudgesPhaseOneEnabled: enabled } : { aiNudgesPhaseTwoEnabled: enabled },
    )
  }

  const phaseOneEnabled = wsSettings?.aiNudgesPhaseOneEnabled ?? true
  const phaseTwoEnabled = wsSettings?.aiNudgesPhaseTwoEnabled ?? false
  const phaseTwoUsage = wsSettings?.aiNudgesPhaseTwoUsage
  const formatTokens = (value: number) => new Intl.NumberFormat('ja-JP').format(value)

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--card-2)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {t('Workspace settings')}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        {t('Settings for how the whole workspace looks and behaves.')}
      </p>

      {readOnly && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            marginBottom: 20,
            borderRadius: 9,
            background: 'var(--amber-soft, var(--card-2))',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontSize: 12.5,
          }}
        >
          <Icon name="alertTriangle" size={14} />
          {t('Changing workspace settings requires the owner role. You can only view them.')}
        </div>
      )}

      {/* ワークスペース情報 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Workspace info')}</h2>
        <div className="card" style={{ padding: 0 }}>
          {/* ロゴ */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 16px',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                flexShrink: 0,
                background: ws?.logoUrl ? 'var(--border)' : 'var(--accent)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 700,
                color: ws?.logoUrl ? undefined : 'var(--on-accent)',
              }}
            >
              {ws?.logoUrl ? (
                <img
                  src={ws.logoUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : ws?.name ? (
                initials(ws.name)
              ) : (
                '?'
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ws?.name ?? '—'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {t('Workspace icon')}
              </div>
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
              style={{
                height: 30,
                fontSize: 12,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              }}
              onClick={() => logoInputRef.current?.click()}
              disabled={logoMutation.isPending || readOnly}
              title={readOnly ? t('Changing workspace settings requires the owner role') : undefined}
            >
              <Icon name="image" size={12} />
              {logoMutation.isPending ? t('Uploading…') : t('Change icon')}
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
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t('Workspace name')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {t('The name shown in navigation')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && wsName.trim() && nameMutation.mutate()}
                readOnly={readOnly}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                onClick={() => nameMutation.mutate()}
                disabled={
                  nameMutation.isPending || !wsName.trim() || wsName === ws?.name || readOnly
                }
                title={readOnly ? t('Changing workspace settings requires the owner role') : undefined}
                className="btn btn-primary"
                style={{
                  height: 32,
                  padding: '0 14px',
                  fontSize: 12.5,
                  flexShrink: 0,
                  ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                {nameSaved ? t('Saved') : nameMutation.isPending ? t('Saving...') : t('Save')}
              </button>
            </div>
          </div>
          {nameMutation.isError && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(nameMutation.error as Error).message}
            </div>
          )}

          {/* 説明 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderTop: '1px solid var(--divider)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t('Description')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {t('Organization or affiliation. Shown under the workspace name in navigation.')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={wsDesc}
                onChange={(e) => setWsDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && descMutation.mutate()}
                placeholder={t('e.g. Example University')}
                readOnly={readOnly}
                style={{ ...inputStyle, width: 180 }}
              />
              <button
                onClick={() => descMutation.mutate()}
                disabled={descMutation.isPending || wsDesc === (ws?.description ?? '') || readOnly}
                title={readOnly ? t('Changing workspace settings requires the owner role') : undefined}
                className="btn btn-primary"
                style={{
                  height: 32,
                  padding: '0 14px',
                  fontSize: 12.5,
                  flexShrink: 0,
                  ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                {descSaved ? t('Saved') : descMutation.isPending ? t('Saving...') : t('Save')}
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
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Customize terminology')}</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Name for projects')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {t('The name shown in navigation and page titles. If empty, "Projects" is used.')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('Projects')}
                readOnly={readOnly}
                style={{ ...inputStyle, width: 160 }}
                onKeyDown={(e) => e.key === 'Enter' && handleLabelSave()}
              />
              <button
                onClick={handleLabelSave}
                disabled={updateSettings.isPending || readOnly}
                title={readOnly ? t('Changing workspace settings requires the owner role') : undefined}
                className="btn btn-primary"
                style={{
                  height: 32,
                  padding: '0 14px',
                  fontSize: 12.5,
                  ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                {labelSaved ? t('Saved') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {FEATURE_FLAGS.aiPmo && (
        <section style={{ marginBottom: 24 }}>
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            AI PMO
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--accent-text)',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent)',
                borderRadius: 999,
                padding: '1px 7px',
              }}
            >
              <Icon name="flask" size={11} /> Lab
            </span>
          </h2>
          <div className="card" style={{ padding: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 16px',
                borderBottom: '1px solid var(--divider)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Phase 1: Task reminders')}</div>
                <div
                  style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}
                >
                  {t('A rules-based reminder that checks due dates and stalled work every morning. It does not use generative AI and spends no tokens.')}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={phaseOneEnabled}
                aria-label={t('Phase 1: Task reminders')}
                disabled={updateSettings.isPending || readOnly}
                title={readOnly ? t('Changing workspace settings requires the owner role') : undefined}
                onClick={() => updateAiNudgesEnabled('one', !phaseOneEnabled)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  flexShrink: 0,
                  ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                <Toggle on={phaseOneEnabled} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Phase 2: AI review of chat')}</div>
                <div
                  style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.5 }}
                >
                  {t('AI analyzes unanswered requests and risks in chat. This spends model tokens, so it is off by default.')}
                </div>
                {isOwner && phaseTwoUsage && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11.5,
                      color: 'var(--text-2)',
                      lineHeight: 1.6,
                    }}
                  >
                    {t('Total: {total} tokens (input {input} / output {output}, {count} requests)', {
                      total: formatTokens(phaseTwoUsage.totalTokens),
                      input: formatTokens(phaseTwoUsage.inputTokens),
                      output: formatTokens(phaseTwoUsage.outputTokens),
                      count: formatTokens(phaseTwoUsage.requestCount),
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={phaseTwoEnabled}
                aria-label={t('Phase 2: AI review of chat')}
                disabled={updateSettings.isPending || readOnly}
                title={readOnly ? t('Changing workspace settings requires the owner role') : undefined}
                onClick={() => updateAiNudgesEnabled('two', !phaseTwoEnabled)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  flexShrink: 0,
                  ...(readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                <Toggle on={phaseTwoEnabled} />
              </button>
            </div>
            {updateSettings.isError && (
              <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--red-text)' }}>
                ⚠ {(updateSettings.error as Error).message}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

const ApiTokenSettings = () => {
  const t = useT()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const { isGuest } = useWorkspacePermissions()
  const [name, setName] = React.useState('MCP client')
  const [scope, setScope] = React.useState<'read' | 'write'>('read')
  const [expiresInDays, setExpiresInDays] = React.useState(90)
  const [issuedToken, setIssuedToken] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [revokeTarget, setRevokeTarget] = React.useState<ApiTokenDto | null>(null)

  const {
    data: tokens = [],
    isLoading,
    error: tokensError,
  } = useQuery<ApiTokenDto[]>({
    queryKey: ['api-tokens'],
    queryFn: async () => {
      const response = await fetchWithAuth('/api/api-tokens')
      if (!response.ok) throw new Error(t('Could not load API tokens'))
      return response.json()
    },
  })
  const visibleTokens = tokens.filter((token) => token.revokedAt === null)
  const issue = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth('/api/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scope, expiresInDays }),
      })
      const body = (await response.json()) as { token?: string; error?: string }
      if (!response.ok || !body.token)
        throw new Error(body.error ?? t('Could not issue the API token'))
      return body.token
    },
    onSuccess: (token) => {
      setIssuedToken(token)
      void queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/api-tokens/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(t('Could not revoke the API token'))
    },
    onSuccess: (_data, revokedId) => {
      toast.success(t('API token revoked'))
      queryClient.setQueryData<ApiTokenDto[]>(['api-tokens'], (current) =>
        current?.filter((token) => token.id !== revokedId),
      )
      void queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })

  const copyToken = async () => {
    if (!issuedToken) return
    try {
      await navigator.clipboard.writeText(issuedToken)
      setCopied(true)
      toast.success(t('API token copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      toast.error(t('Could not copy the API token'))
    }
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>{t('MCP / API tokens')}</h2>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
        {t('Use ChatGPT or Claude to operate this workspace in Cairn as yourself.')}
      </p>

      {issuedToken && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 12, borderColor: 'var(--accent)' }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {t('Save this token now')}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
            {t('This value cannot be shown again after you close it.')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <code
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 10px',
                overflow: 'auto',
                borderRadius: 7,
                background: 'var(--card-2)',
                fontSize: 11.5,
              }}
            >
              {issuedToken}
            </code>
            <button type="button" className="btn btn-primary" onClick={() => void copyToken()}>
              {copied ? t('Copied') : t('Copy')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setIssuedToken(null)}>
              {t('Close')}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        {isGuest ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {t('Guests cannot issue API tokens.')}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <input
              className="form-control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={t('Token name')}
              maxLength={100}
              placeholder={t('Token name')}
              style={{ flex: '1 1 240px', minWidth: 0 }}
            />
            <select
              className="form-control"
              value={scope}
              onChange={(event) => setScope(event.target.value as 'read' | 'write')}
              aria-label={t('Permission')}
              style={{ minWidth: 104, cursor: 'pointer' }}
            >
              <option value="read">{t('Read')}</option>
              <option value="write">{t('Read and write')}</option>
            </select>
            <select
              className="form-control"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              aria-label={t('Validity period')}
              style={{ minWidth: 84, cursor: 'pointer' }}
            >
              <option value={30}>{t('For 30 days')}</option>
              <option value={90}>{t('For 90 days')}</option>
              <option value={365}>{t('For 1 year')}</option>
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim() || issue.isPending}
              onClick={() => issue.mutate()}
            >
              {issue.isPending ? t('Issuing...') : t('Issue')}
            </button>
          </div>
        )}

        {issue.isError && (
          <div style={{ color: 'var(--red-text)', fontSize: 12, marginBottom: 10 }}>
            {(issue.error as Error).message}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
          {t('Read and write includes read. The default is 90 days, the maximum is 1 year, and each token allows 120 requests per minute.')}
        </div>
        {isLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('Loading...')}</div>
        ) : tokensError ? (
          <div style={{ fontSize: 12, color: 'var(--red-text)' }}>
            ⚠ {(tokensError as Error).message}
          </div>
        ) : visibleTokens.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('No tokens have been issued.')}</div>
        ) : (
          visibleTokens.map((token) => {
            const inactive = new Date(token.expiresAt) <= new Date()
            return (
              <div
                key={token.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderTop: '1px solid var(--divider)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{token.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    <code>{token.prefix}…</code>
                    {t(' · {scope} · Expires {date}', {
                      scope: token.scope === 'write' ? t('Read and write') : t('Read'),
                      date: formatAppDate(locale, token.expiresAt),
                    })}
                    {token.lastUsedAt
                      ? t(' · Last used {date}', {
                          date: formatAppDate(locale, token.lastUsedAt),
                        })
                      : ''}
                    {inactive ? t(' · Inactive') : ''}
                  </div>
                </div>
                {!inactive && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--red-text)' }}
                    disabled={revoke.isPending}
                    onClick={() => setRevokeTarget(token)}
                  >
                    {t('Revoke access')}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
      <ConfirmDialog
        open={revokeTarget !== null}
        title={t('Revoke "{name}"?', { name: revokeTarget?.name ?? '' })}
        message={t('Apps using this access will stop working. This cannot be undone.')}
        confirmLabel={t('Revoke access')}
        busyLabel={t('Revoking access...')}
        onConfirm={async () => { if (revokeTarget) await revoke.mutateAsync(revokeTarget.id) }}
        onClose={() => setRevokeTarget(null)}
      />
    </section>
  )
}

const McpOAuthConnectionSettings = () => {
  const t = useT()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const [mcpUrl, setMcpUrl] = React.useState('/api/mcp')
  const [revokeTarget, setRevokeTarget] = React.useState<McpOAuthConnectionDto | null>(null)
  React.useEffect(() => setMcpUrl(`${window.location.origin}/api/mcp`), [])
  const {
    data: connections = [],
    isLoading,
    error,
  } = useQuery<McpOAuthConnectionDto[]>({
    queryKey: ['mcp-oauth-connections'],
    queryFn: async () => {
      const response = await fetchWithAuth('/api/oauth/connections')
      if (!response.ok) throw new Error(t('Could not load OAuth connections'))
      return response.json()
    },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/oauth/connections/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(t('Could not revoke the OAuth connection'))
    },
    onSuccess: (_data, revokedId) => {
      toast.success(t('OAuth connection revoked'))
      queryClient.setQueryData<McpOAuthConnectionDto[]>(['mcp-oauth-connections'], (current) =>
        current?.filter((connection) => connection.id !== revokedId),
      )
    },
  })

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>{t('MCP OAuth connections')}</h2>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
        {t('Register only this URL in Claude Web/Desktop, then allow the connection in Cairn.')}
      </p>
      <div className="card" style={{ padding: 16 }}>
        <code style={{ display: 'block', overflow: 'auto', fontSize: 11.5, marginBottom: 14 }}>
          {mcpUrl}
        </code>
        {isLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('Loading...')}</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: 'var(--red-text)' }}>⚠ {(error as Error).message}</div>
        ) : connections.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('There are no active OAuth connections.')}</div>
        ) : (
          connections.map((connection) => (
            <div
              key={connection.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderTop: '1px solid var(--divider)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{connection.clientName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {t('{scope} · Connected {date}', {
                    scope: connection.scope === 'write' ? t('Read and write access') : t('Read'),
                    date: formatAppDate(locale, connection.createdAt),
                  })}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--red-text)' }}
                disabled={revoke.isPending}
                onClick={() => setRevokeTarget(connection)}
              >
                {t('Revoke access')}
              </button>
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={revokeTarget !== null}
        title={t('Revoke the connection with "{name}"?', { name: revokeTarget?.clientName ?? '' })}
        message={t('Apps using this access will stop working. This cannot be undone.')}
        confirmLabel={t('Revoke access')}
        busyLabel={t('Revoking access...')}
        onConfirm={async () => { if (revokeTarget) await revoke.mutateAsync(revokeTarget.id) }}
        onClose={() => setRevokeTarget(null)}
      />
    </section>
  )
}

const SettingsIntegrations = () => {
  const t = useT()
  // ── iCal 出力 ──────────────────────────────────────────────────────
  const { data: ws } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then((r) => r.json()),
  })
  const { data, refetch } = useQuery<{ token: string }>({
    queryKey: ['ical-token'],
    queryFn: () => fetchWithAuth('/api/calendar/token').then((r) => r.json()),
  })
  const regenerate = useMutation({
    mutationFn: () =>
      fetchWithAuth('/api/calendar/token', { method: 'POST' }).then((r) => r.json()),
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
    {
      scope: 'me',
      label: t('Projects you belong to'),
      desc: t('Dates and milestone schedules for projects you belong to'),
    },
    {
      scope: 'workspace',
      label: t('Entire workspace'),
      desc: t('Dates and milestone schedules for every project in the workspace'),
    },
  ]

  // ── Google カレンダー読み込み ───────────────────────────────────────
  const queryClient = useQueryClient()
  // OAuth コールバックから戻ったときの結果をトーストで知らせる（処理後に URL からパラメータを消すので再実行されても重複しない）
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gcal = params.get('gcal')
    if (!gcal) return
    if (gcal === 'connected') toast.success(t('Connected to Google Calendar'))
    else if (gcal === 'error') toast.error(t('Could not connect. Try again.'))
    else if (gcal === 'denied') toast.info(t('The connection was canceled.'))
    const url = new URL(window.location.href)
    url.searchParams.delete('gcal')
    window.history.replaceState({}, '', url.toString())
  }, [t])

  const { data: gcalStatus, isLoading: gcalLoading } = useQuery<GcalStatusDto>({
    queryKey: ['gcal-status'],
    queryFn: () => fetchWithAuth('/api/calendar/google/status').then((r) => r.json()),
  })

  const {
    data: gcalCalendars,
    isLoading: gcalCalendarsLoading,
    error: gcalCalendarsError,
  } = useQuery<GcalCalendarDto[]>({
    queryKey: ['gcal-calendars'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/calendar/google/calendars')
      const body = (await res.json().catch(() => null)) as GcalCalendarDto[]
        | { error?: string; code?: string }
        | null
      if (!res.ok) {
        throw new GcalCalendarsError(
          (body && !Array.isArray(body) && body.error) ||
            t('Could not load the Google Calendar list'),
          body && !Array.isArray(body) ? body.code : undefined,
        )
      }
      if (!Array.isArray(body)) {
        throw new GcalCalendarsError(t('The Google Calendar list format is invalid'))
      }
      return body
    },
    enabled: gcalStatus?.connected === true,
  })

  const connectGcal = async () => {
    const res = await fetchWithAuth('/api/calendar/google/connect')
    const { url } = (await res.json()) as { url?: string; error?: string }
    if (url) window.location.href = url
  }

  const disconnectGcal = useMutation({
    mutationFn: () =>
      fetchWithAuth('/api/calendar/google/disconnect', { method: 'POST' }).then((r) => r.json()),
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
      .filter((c) => calendarSelection[c.id])
      .map((c) => ({ id: c.id, name: c.name, color: c.color }))
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
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {t('Integrations')}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        {t('Configure connections to external services.')}
      </p>

      <McpOAuthConnectionSettings />
      <ApiTokenSettings />

      {/* ── iCal 出力セクション ───────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>
          {t('Cairn → Google Calendar (iCal export)')}
        </h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
          {t('Copy the URL and paste it into Google Calendar under “Add other calendars” → “From URL”.')}
        </p>
        <div className="card" style={{ padding: 0 }}>
          {feeds.map((f, i) => (
            <div
              key={f.scope}
              style={{
                padding: '14px 16px',
                borderBottom: i === 0 ? '1px solid var(--divider)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>
                    {f.desc}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--card-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 7,
                      padding: '6px 10px',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 11.5,
                        color: 'var(--text-3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                      }}
                    >
                      {data?.token ? buildUrl(f.scope) : t('Loading...')}
                    </span>
                    <button
                      onClick={() => copy(f.scope)}
                      disabled={!data?.token}
                      className="btn btn-ghost"
                      style={{
                        height: 26,
                        fontSize: 11.5,
                        padding: '0 8px',
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name={copiedScope === f.scope ? 'check' : 'copy'} size={12} />
                      {copiedScope === f.scope ? t('Copied') : t('Copy')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--divider)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              {t('Anyone with the URL can view the calendar. If it leaks, regenerate it.')}
            </span>
            <button
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              className="btn btn-ghost"
              style={{
                height: 28,
                fontSize: 12,
                padding: '0 10px',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name="refresh" size={12} /> {t('Regenerate URL')}
            </button>
          </div>
        </div>
      </section>

      {/* ── Google カレンダー読み込みセクション ──────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {t('Google Calendar → Cairn (import events)')}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--accent-text)',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              borderRadius: 999,
              padding: '1px 7px',
            }}
          >
            <Icon name="flask" size={11} /> Lab
          </span>
        </h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
          {t('Overlays Google Calendar events on the calendar view. This is experimental and may change.')}
        </p>

        <div className="card" style={{ padding: 0 }}>
          {gcalLoading ? (
            <div style={{ padding: '20px 16px', color: 'var(--text-3)', fontSize: 13 }}>
              {t('Loading...')}
            </div>
          ) : !gcalStatus?.configured ? (
            <div style={{ padding: '16px', fontSize: 12.5, color: 'var(--text-3)' }}>
              <Icon name="alertTriangle" size={13} style={{ marginRight: 6 }} />
              {t('Environment variables')}{' '}
              <code
                style={{
                  fontFamily: 'monospace',
                  background: 'var(--card-2)',
                  padding: '1px 4px',
                  borderRadius: 4,
                }}
              >
                GOOGLE_CALENDAR_CLIENT_ID
              </code>{' '}
              /{' '}
              <code
                style={{
                  fontFamily: 'monospace',
                  background: 'var(--card-2)',
                  padding: '1px 4px',
                  borderRadius: 4,
                }}
              >
                GOOGLE_CALENDAR_CLIENT_SECRET
              </code>{' '}
              {t('are not set.')}
            </div>
          ) : !gcalStatus.connected ? (
            <div
              style={{
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t('Not connected')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {t('Connect a Google account to load calendars.')}
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 32,
                  padding: '0 14px',
                  fontSize: 12.5,
                  flexShrink: 0,
                }}
                onClick={() => void connectGcal()}
              >
                <Icon name="calendar" size={13} /> {t('Connect with Google')}
              </button>
            </div>
          ) : (
            <>
              {/* 接続済みヘッダー */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--divider)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--emerald-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="check" size={15} color="var(--emerald-text)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t('Connected')}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{gcalStatus.email}</div>
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: 'var(--red-text)', height: 28, padding: '0 10px' }}
                  onClick={() => disconnectGcal.mutate()}
                  disabled={disconnectGcal.isPending}
                >
                  {t('Disconnect')}
                </button>
              </div>

              {/* カレンダー選択 */}
              <div style={{ padding: '12px 16px' }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    marginBottom: 10,
                  }}
                >
                  {t('Calendars to show')}
                </div>
                {gcalCalendarsLoading ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>{t('Loading...')}</div>
                ) : gcalCalendarsError ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
                      {gcalCalendarsError.message}
                    </div>
                    {(gcalCalendarsError as GcalCalendarsError).code ===
                      'GOOGLE_RECONNECT_REQUIRED' && (
                      <button
                        className="btn btn-primary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 30,
                          padding: '0 12px',
                          fontSize: 12.5,
                          flexShrink: 0,
                        }}
                        onClick={() => void connectGcal()}
                      >
                        <Icon name="calendar" size={13} /> {t('Reconnect Google')}
                      </button>
                    )}
                  </div>
                ) : !gcalCalendars ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
                    {t('Could not get the Google Calendar list.')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {gcalCalendars.map((cal) => (
                      <label
                        key={cal.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                          padding: '4px 0',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={calendarSelection[cal.id] ?? false}
                          onChange={(e) =>
                            setCalendarSelection((prev) => ({
                              ...prev,
                              [cal.id]: e.target.checked,
                            }))
                          }
                          style={{
                            width: 14,
                            height: 14,
                            accentColor: cal.color,
                            cursor: 'pointer',
                          }}
                        />
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: cal.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 13, flex: 1 }}>
                          {cal.name}
                          {cal.primary && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 10.5,
                                color: 'var(--text-4)',
                                background: 'var(--card-2)',
                                borderRadius: 4,
                                padding: '1px 5px',
                              }}
                            >
                              {t('Primary')}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {gcalCalendars && (
                <div
                  style={{
                    padding: '10px 16px',
                    borderTop: '1px solid var(--divider)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    className="btn btn-primary"
                    style={{ height: 30, fontSize: 12.5, padding: '0 14px' }}
                    onClick={() => void saveCalendarSelection()}
                    disabled={savingCalendars}
                  >
                    {savingCalendars ? t('Saving...') : t('Save')}
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
import type { BillingSummaryDto } from '@/app/api/billing/summary/route'
import { BILLING_CONFIG } from '@cairn/core/billing'

const FREE_TIER_REFERENCE_GB = 10
const CREDIT_PACK_FULFILLMENT_TIMEOUT_MS = 60_000

export function resolveCreditPackFulfillmentPolling(input: {
  isCreditPackReturn: boolean
  sessionId: string | null
  fulfilled: boolean | null | undefined
  startedAt: number
  now: number
}): 'idle' | 'polling' | 'fulfilled' | 'timed_out' {
  if (!input.isCreditPackReturn || input.sessionId === null) return 'idle'
  if (input.fulfilled === true) return 'fulfilled'
  return input.now - input.startedAt < CREDIT_PACK_FULFILLMENT_TIMEOUT_MS ? 'polling' : 'timed_out'
}

const SettingsBilling = () => {
  const t = useT()
  const [billingAction, setBillingAction] = React.useState<
    'checkout' | 'credit-pack' | 'portal' | null
  >(null)
  const [billingActionError, setBillingActionError] = React.useState<string | null>(null)
  const searchParams = useSearchParams()
  const creditPackSessionId = searchParams.get('credit_pack_session_id')
  const isCreditPackReturn = searchParams.get('credit_pack') === 'success'
  const creditPackPollingStartedAt = React.useRef(Date.now())
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspace-storage-usage'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/workspaces/storage-usage')
      if (!res.ok) throw new Error(t('Could not load'))
      return res.json() as Promise<WorkspaceStorageUsageDto>
    },
  })
  const billingQuery = useQuery({
    queryKey: ['billing-summary', creditPackSessionId],
    queryFn: async () => {
      const summaryUrl = creditPackSessionId
        ? `/api/billing/summary?credit_pack_session_id=${encodeURIComponent(creditPackSessionId)}`
        : '/api/billing/summary'
      const res = await fetchWithAuth(summaryUrl)
      if (!res.ok) throw new Error(t('Could not load billing information'))
      return res.json() as Promise<BillingSummaryDto>
    },
    refetchInterval: (query) =>
      resolveCreditPackFulfillmentPolling({
        isCreditPackReturn,
        sessionId: creditPackSessionId,
        fulfilled: query.state.data?.creditPackFulfilled,
        startedAt: creditPackPollingStartedAt.current,
        now: Date.now(),
      }) === 'polling'
        ? 2_000
        : false,
  })
  const creditPackFulfillmentState = resolveCreditPackFulfillmentPolling({
    isCreditPackReturn,
    sessionId: creditPackSessionId,
    fulfilled: billingQuery.data?.creditPackFulfilled,
    startedAt: creditPackPollingStartedAt.current,
    now: Date.now(),
  })

  const beginCheckout = async () => {
    setBillingAction('checkout')
    setBillingActionError(null)
    try {
      const res = await fetchWithAuth('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 }),
      })
      const result = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !result.url) throw new Error(result.error ?? t('Could not open checkout'))
      window.location.assign(result.url)
    } catch (err) {
      setBillingAction(null)
      setBillingActionError(err instanceof Error ? err.message : t('Could not open checkout'))
    }
  }

  const openPortal = async () => {
    setBillingAction('portal')
    setBillingActionError(null)
    try {
      const res = await fetchWithAuth('/api/billing/portal', { method: 'POST' })
      const result = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !result.url) throw new Error(result.error ?? t('Could not open the billing portal'))
      window.location.assign(result.url)
    } catch (err) {
      setBillingAction(null)
      setBillingActionError(err instanceof Error ? err.message : t('Could not open the billing portal'))
    }
  }

  const beginCreditPackCheckout = async () => {
    setBillingAction('credit-pack')
    setBillingActionError(null)
    try {
      const res = await fetchWithAuth('/api/billing/credit-packs/checkout', { method: 'POST' })
      const result = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !result.url) throw new Error(result.error ?? t('Could not open checkout'))
      window.location.assign(result.url)
    } catch (err) {
      setBillingAction(null)
      setBillingActionError(err instanceof Error ? err.message : t('Could not open checkout'))
    }
  }

  const totalGb = (data?.originalBytes ?? 0) / 1024 ** 3
  const ratio = Math.min(1, totalGb / FREE_TIER_REFERENCE_GB)

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {t('Billing')}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        {billingQuery.data?.billingEnabled
          ? t('Manage original-file storage and storage rent with workspace credits.')
          : t('Storage usage is only being measured, and no limit is set.')}
      </p>

      {billingQuery.isError ? (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--red-text)' }}>
          ⚠ {t('Could not load billing')}
        </div>
      ) : billingQuery.data?.billingEnabled ? (
        <section className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>
                {t('Workspace Cairn')}
              </h2>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>
                {t('{count} stones', { count: billingQuery.data.creditBalance })}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12.5,
                  color:
                    billingQuery.data.workspaceState === 'weathered'
                      ? 'var(--amber-text)'
                      : 'var(--text-3)',
                }}
              >
                {billingQuery.data.workspaceState === 'weathered'
                  ? t('Weathering. Originals can be viewed as compressed copies.')
                  : t('Credits can keep originals stored.')}
              </div>
            </div>
            {billingQuery.data.hasManageableSubscription ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {billingQuery.data.canPurchaseCreditPack && (
                  <button
                    className="btn btn-primary"
                    style={{ height: 32, fontSize: 12.5 }}
                    onClick={() => void beginCreditPackCheckout()}
                    disabled={billingAction !== null}
                  >
                    {billingAction === 'credit-pack'
                      ? t('Opening...')
                      : t('Add stones (¥{price} / {credits} stones)', { price: BILLING_CONFIG.creditPackPriceJpy, credits: BILLING_CONFIG.creditPackCredits })}
                  </button>
                )}
                <button
                  className="btn"
                  style={{ height: 32, fontSize: 12.5 }}
                  onClick={() => void openPortal()}
                  disabled={billingAction !== null}
                >
                  {billingAction === 'portal' ? t('Opening...') : t('Manage subscription')}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                style={{ height: 32, fontSize: 12.5 }}
                onClick={() => void beginCheckout()}
                disabled={billingAction !== null}
              >
                {billingAction === 'checkout' ? t('Opening...') : t('Stack stones (¥300 per month)')}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {billingQuery.data?.billingEnabled && (
        <CreditPlacementBoard workspaceState={billingQuery.data.workspaceState} />
      )}

      {billingActionError && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--red-text)' }}>
          ⚠ {billingActionError}
        </div>
      )}

      {creditPackFulfillmentState === 'polling' && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-3)' }}>
          {t('Confirming the payment. The credit balance updates automatically.')}
        </div>
      )}

      {creditPackFulfillmentState === 'timed_out' && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--red-text)' }}>
          ⚠
          {t('Could not confirm that the payment was applied. Reload in a few minutes, and contact support if it is still missing.')}
        </div>
      )}

      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>{t('Storage usage')}</h2>
        {isLoading ? (
          <div style={{ color: 'var(--text-4)', fontSize: 13 }}>{t('Loading...')}</div>
        ) : isError ? (
          // 取得失敗を 0GB として偽装しない（バックエンド/マイグレーション不備を隠さないため）
          <div style={{ fontSize: 13, color: 'var(--red-text)' }}>
            ⚠ {t('Could not load storage usage')}
          </div>
        ) : (
          <>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: 'var(--card-2)',
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${ratio * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {t('{amount} GB in use (reference line: {reference} GB)', { amount: totalGb.toFixed(2), reference: FREE_TIER_REFERENCE_GB })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const SettingsContributions = () => {
  const t = useT()
  const billingQuery = useQuery({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/billing/summary')
      if (!res.ok) throw new Error(t('Could not load billing information'))
      return res.json() as Promise<BillingSummaryDto>
    },
  })

  if (billingQuery.isLoading) {
    return <div style={{ color: 'var(--text-4)', fontSize: 13 }}>{t('Loading...')}</div>
  }
  if (billingQuery.isError) {
    return (
      <div style={{ color: 'var(--red-text)', fontSize: 13 }}>⚠ {t('Could not load Cairn')}</div>
    )
  }
  if (!billingQuery.data?.billingEnabled) return null

  return <CreditPlacementBoard workspaceState={billingQuery.data.workspaceState} />
}

// ─── Developer ────────────────────────────────────────────────────

import type { DevStatusDto, ServiceStatus } from '@/app/api/dev/status/route'

const STATUS_CONFIG: Record<ServiceStatus['status'], { label: string; color: string; bg: string }> =
  {
    ok: { label: 'Connected', color: 'var(--emerald-text)', bg: 'var(--emerald-soft)' },
    error: { label: 'Error', color: 'var(--red-text)', bg: 'var(--red-soft)' },
    unconfigured: { label: 'Not configured', color: 'var(--text-4)', bg: 'var(--card-2)' },
  }

const MANUAL_OK_STATUS = { label: 'Not checked', color: 'var(--text-4)', bg: 'var(--card-2)' }

function getStatusBadgeConfig(status: ServiceStatus, hasLiveDiagnostic: boolean) {
  if (status.status !== 'ok') return STATUS_CONFIG[status.status]
  return hasLiveDiagnostic ? STATUS_CONFIG.ok : MANUAL_OK_STATUS
}

function getStatusBadgeLabel(status: ServiceStatus, hasLiveDiagnostic: boolean) {
  return getStatusBadgeConfig(status, hasLiveDiagnostic).label
}

type ServiceKey = Exclude<keyof DevStatusDto, 'env'>
const SERVICE_META: { key: ServiceKey; label: string; icon: string; purpose: string }[] = [
  {
    key: 'supabaseDb',
    label: 'Supabase Database',
    icon: 'database',
    purpose: 'Required to store all data such as projects, tasks, and messages',
  },
  {
    key: 'supabaseStorage',
    label: 'Supabase Storage',
    icon: 'archive',
    purpose: 'Required to store cover photos, gallery images, and attachments',
  },
  {
    key: 'inngest',
    label: 'Inngest',
    icon: 'sparkles',
    purpose: 'Required to run async jobs such as the AI agent, notifications, and integrations',
  },
  {
    key: 'openai',
    label: 'OpenAI',
    icon: 'sparkles',
    purpose: 'Required for the AI assistant, document summaries, and vector search',
  },
  {
    key: 'googleMaps',
    label: 'Google Maps Platform',
    icon: 'map-pin',
    purpose: 'Required for place autocomplete and cover photos when creating a project',
  },
  {
    key: 'tavily',
    label: 'Tavily',
    icon: 'search',
    purpose: 'Required for AI agent web search (optional)',
  },
]

const SettingsDeveloper = () => {
  const t = useT()
  const { isOwner } = useWorkspacePermissions()
  const { data: staticData, isLoading } = useQuery<DevStatusDto>({
    queryKey: ['dev-status'],
    queryFn: () => fetchWithAuth('/api/dev/status').then((r) => r.json()),
    staleTime: 0,
    gcTime: 0,
  })
  const [diagnosticData, setDiagnosticData] = React.useState<DevStatusDto | null>(null)
  const diagnose = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/dev/status', { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? t('Could not run diagnostics'))
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
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
          {t('Developer info')}
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
          {t('Only the workspace owner can use this section.')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h1
          style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', flex: 1 }}
        >
          {t('Developer info')}
        </h1>
        <button
          className="btn"
          onClick={() => void diagnose.mutateAsync()}
          disabled={diagnose.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
        >
          <Icon
            name="refresh"
            size={13}
            style={diagnose.isPending ? { animation: 'spin 1s linear infinite' } : {}}
          />
          {t('Manual diagnostics')}
        </button>
      </div>
      <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 10 }}>
        {t('The initial view shows configuration only. Live checks of external services run only during manual diagnostics.')}
      </p>
      {diagnose.error && (
        <p style={{ color: 'var(--red-text)', fontSize: 12.5, margin: '0 0 18px' }}>
          {diagnose.error instanceof Error ? diagnose.error.message : t('Could not run diagnostics')}
        </p>
      )}
      {!diagnose.data && (
        <p style={{ color: 'var(--text-4)', fontSize: 12, margin: '0 0 28px' }}>
          {t('Live checks such as OpenAI run only from "Manual diagnostics".')}
        </p>
      )}

      <section style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-4)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {t('External services')}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          {SERVICE_META.map(({ key, label, icon, purpose }) => {
            const s = data?.[key]
            const cfg = s ? getStatusBadgeConfig(s, hasLiveDiagnostic) : null
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'var(--card)',
                  borderBottom: '1px solid var(--divider)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--card-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={icon} size={15} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>
                    {t(purpose)}
                  </div>
                  {s?.detail && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                      {s.detail}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {s?.latencyMs != null && s.status === 'ok' && (
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{s.latencyMs}ms</span>
                  )}
                  {isLoading ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-4)',
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: 'var(--card-2)',
                      }}
                    >
                      {t('Checking...')}
                    </span>
                  ) : cfg && s ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: cfg.color,
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: cfg.bg,
                      }}
                    >
                      {t(getStatusBadgeLabel(s, hasLiveDiagnostic))}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-4)',
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: 'var(--card-2)',
                      }}
                    >
                      -
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {data?.env && (
        <section>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-4)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {t('Environment variables')}
          </div>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[
              { label: 'NODE_ENV', value: data.env.nodeEnv },
              { label: 'VAPID', value: data.env.hasVapid ? t('Configured') : t('Not configured (push notifications off)') },
            ].map(({ label, value }, i, arr) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  background: 'var(--card)',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: 'var(--text-3)',
                    width: 140,
                    flexShrink: 0,
                  }}
                >
                  {label}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function getSettingsNavGroups(
  isOwner: boolean,
  options: { isMobile?: boolean } = {},
): { label: string; items: SettingsSectionMeta[] }[] {
  const workspaceItems: SettingsSectionMeta[] = [
    { id: 'general', label: 'Workspace settings', icon: 'settings' },
    { id: 'workflow', label: 'Workflow', icon: 'flag' },
    { id: 'project-roles', label: 'Roles', icon: 'users' },
    { id: 'profile-attributes', label: 'Profile attributes', icon: 'hash' },
    { id: 'ai', label: 'AI agent', icon: 'sparkles' },
    { id: 'members', label: 'Members', icon: 'users' },
    { id: 'integrations', label: 'Integrations', icon: 'layers' },
    ...(options.isMobile
      ? [{ id: 'contributions', label: 'Cairn', icon: 'layers' } satisfies SettingsSectionMeta]
      : []),
    ...(!options.isMobile
      ? [{ id: 'billing', label: 'Billing', icon: 'archive' } satisfies SettingsSectionMeta]
      : []),
  ]

  return [
    {
      label: 'Personal',
      items: [
        { id: 'account', label: 'Account', icon: 'user' },
        { id: 'appearance', label: 'Appearance', icon: 'sun' },
        { id: 'safety', label: 'Safety and support', icon: 'shield' },
      ],
    },
    {
      label: 'Workspace',
      items: workspaceItems,
    },
    ...(isOwner
      ? [
          {
            label: 'Developer',
            items: [{ id: 'developer', label: 'Developer info', icon: 'code' }],
          },
        ]
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
  account: SettingsAccount,
  appearance: SettingsAppearance,
  safety: SettingsSafety,
  general: SettingsWorkspaceGeneral,
  workflow: SettingsWorkflow,
  'project-roles': SettingsProjectRoles,
  'profile-attributes': ProfileAttributesSettings,
  ai: SettingsAI,
  integrations: SettingsIntegrations,
  billing: SettingsBilling,
  contributions: SettingsContributions,
  developer: SettingsDeveloper,
}

const DEFAULT_SECTION = 'account'

export function isSettingsSection(
  id: string | null | undefined,
  isOwner = true,
  options: { isMobile?: boolean } = {},
): id is string {
  return (
    id != null &&
    new Set(getSettingsNavGroups(isOwner, options).flatMap((g) => g.items.map((i) => i.id))).has(id)
  )
}

export function settingsSectionLabel(
  id: string,
  isOwner = true,
  options: { isMobile?: boolean } = {},
): string {
  for (const g of getSettingsNavGroups(isOwner, options)) {
    const item = g.items.find((i) => i.id === id)
    if (item) return item.label
  }
  return 'Settings'
}

// セクションのメインカラム本体（PC・モバイル共通）。
export function SettingsSectionContent({ section }: { section: string }) {
  const t = useT()
  const Comp = SETTINGS_SECTION_COMPONENTS[section]
  if (Comp) return <Comp />
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>{t(settingsSectionLabel(section))}</h1>
      <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('Settings for this section are not ready yet.')}</p>
    </div>
  )
}

export const PageSettings = () => {
  const t = useT()
  const pathname = usePathname()
  const router = useRouter()
  const { isOwner } = useWorkspacePermissions()
  const navGroups = getSettingsNavGroups(isOwner)
  const seg = pathname.split('/')[2]
  const section = isSettingsSection(seg, isOwner) ? seg : DEFAULT_SECTION
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopBar title={t('Settings')} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside
          style={{
            width: 220,
            borderRight: '1px solid var(--border)',
            padding: '20px 14px',
            background: 'var(--card)',
          }}
        >
          {navGroups.map((group, gi) => (
            <div key={group.label} style={{ marginBottom: gi < navGroups.length - 1 ? 16 : 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--text-4)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '0 10px',
                  marginBottom: 4,
                }}
              >
                {t(group.label)}
              </div>
              {group.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/settings/${s.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 7,
                    border: 'none',
                    background: section === s.id ? 'var(--card-hover)' : 'transparent',
                    color: section === s.id ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: section === s.id ? 600 : 500,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon name={s.icon} size={14} /> {t(s.label)}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
          <SettingsSectionContent section={section} />
        </div>
      </div>
    </div>
  )
}
