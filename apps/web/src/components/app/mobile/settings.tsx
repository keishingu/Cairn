// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { MobileHeader } from './header'
import { Icon, Avatar } from '../primitives'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createClient } from '@/lib/supabase/client'
import type { CurrentUserDto } from '@/app/api/me/route'
import {
  getSettingsNavGroups,
  SettingsSectionContent,
  isSettingsSection,
  settingsSectionLabel,
} from '../pages/settings'

const ROLE_LABEL: Record<CurrentUserDto['wsRole'], string> = {
  owner:  'オーナー',
  admin:  '管理者',
  member: 'メンバー',
  guest:  'ゲスト',
}

// 設定一覧（メニュー）。各項目タップで /settings/[section] に遷移する。
export function MobileSettings() {
  const { data: me } = useCurrentUser()
  const router = useRouter()
  const navGroups = getSettingsNavGroups(me?.wsRole === 'owner')

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="設定"/>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {/* プロフィールカード（アカウント設定へのショートカット） */}
        <button
          onClick={() => router.push('/settings/account')}
          style={{
            margin: '16px 16px 8px', width: 'calc(100% - 32px)',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 14,
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          }}
        >
          <Avatar name={me?.displayName ?? ''} url={me?.avatarUrl ?? null} size={56}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{me?.displayName ?? ''}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{me?.email ?? ''}</div>
            {me?.wsRole && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent-text)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{ROLE_LABEL[me.wsRole]}</span>
              </div>
            )}
          </div>
          <Icon name="chevRight" size={16} color="var(--text-4)"/>
        </button>

        {/* セクション一覧 */}
        {navGroups.map(group => (
          <div key={group.label} style={{ margin: '16px 16px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>{group.label}</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {group.items.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => router.push(`/settings/${item.id}`)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '15px 16px', border: 'none', background: 'transparent',
                    borderTop: i > 0 ? '1px solid var(--divider)' : 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={item.icon} size={16} color="var(--text-2)"/>
                  </div>
                  <span style={{ flex: 1, fontSize: 14.5, color: 'var(--text)', fontWeight: 500 }}>{item.label}</span>
                  <Icon name="chevRight" size={14} color="var(--text-4)"/>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* ログアウト */}
        <div style={{ margin: '24px 16px 0' }}>
          <button onClick={handleLogout} style={{ width: '100%', padding: '15px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--rose)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}

// 個別設定画面。PC版のメインカラム（SettingsSectionContent）をそのまま表示する。
export function MobileSettingsDetail({ section }: { section: string }) {
  const { data: me } = useCurrentUser()
  const router = useRouter()
  const isOwner = me?.wsRole === 'owner'
  const resolvedSection = isSettingsSection(section, isOwner) ? section : 'account'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title={settingsSectionLabel(resolvedSection, isOwner)} onBack={() => router.push('/settings')}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <SettingsSectionContent section={resolvedSection}/>
      </div>
    </div>
  )
}
