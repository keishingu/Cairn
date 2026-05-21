// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useTheme } from 'next-themes'
import { MobileHeader } from '../mobile-header'
import { Icon, Avatar } from '../../primitives'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'

const PERSONAL_SECTIONS = [
  {
    title: 'アカウント',
    items: [
      { icon: 'users',    label: 'プロフィール編集', value: '山田 太郎' },
      { icon: 'bell',     label: '通知設定',         value: 'オン' },
    ],
  },
]

const WORKSPACE_SECTIONS = [
  {
    title: 'ワークスペース',
    items: [
      { icon: 'folder',   label: 'プロジェクト一覧', value: '8件' },
      { icon: 'users',    label: 'メンバー管理',     value: '8人' },
    ],
  },
  {
    title: 'AIアシスタント',
    items: [
      { icon: 'sparkles', label: 'AIモデル',         value: 'GPT-4o' },
      { icon: 'gear',     label: 'プロンプト設定',   value: '' },
    ],
  },
  {
    title: 'その他',
    items: [
      { icon: 'file',     label: 'プライバシーポリシー', value: '' },
      { icon: 'gear',     label: 'アプリについて',       value: 'v1.0.0' },
    ],
  },
]

type ThemeValue = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'light',  label: 'ライト',   icon: 'sun' },
  { value: 'system', label: 'システム', icon: 'monitor' },
  { value: 'dark',   label: 'ダーク',   icon: 'moon' },
]

const SectionList = ({ sections }: { sections: typeof PERSONAL_SECTIONS }) => (
  <>
    {sections.map(section => (
      <div key={section.title} style={{ margin: '16px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>{section.title}</div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {section.items.map((item, i) => (
            <button key={item.label} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '15px 16px', border: 'none', background: 'transparent',
              borderTop: i > 0 ? '1px solid var(--divider)' : 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={item.icon} size={16} color="var(--text-2)"/>
              </div>
              <span style={{ flex: 1, fontSize: 14.5, color: 'var(--text)', fontWeight: 500 }}>{item.label}</span>
              {item.value && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{item.value}</span>}
              <Icon name="chevRight" size={14} color="var(--text-4)"/>
            </button>
          ))}
        </div>
      </div>
    ))}
  </>
)

export function MobileSettings() {
  const { theme, setTheme } = useTheme()
  const { accentId, setAccentId } = useAccentColor()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="設定"/>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {/* Profile card */}
        <div style={{ margin: '16px 16px 8px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name="山田 太郎" size={56}/>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>山田 太郎</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>yamada@example.com</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent-text)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>オーナー</span>
            </div>
          </div>
        </div>

        {/* 個人設定 */}
        <div style={{ margin: '16px 16px 0', fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', paddingLeft: 4 }}>個人</div>
        <SectionList sections={PERSONAL_SECTIONS}/>

        {/* 外観 */}
        <div style={{ margin: '16px 16px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>外観</div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>テーマ</div>
            {mounted && (
              <div style={{ display: 'flex', gap: 6 }}>
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '10px 6px', borderRadius: 10,
                      border: `2px solid ${theme === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: theme === opt.value ? 'var(--accent-soft)' : 'var(--card-2)',
                      color: theme === opt.value ? 'var(--accent-text)' : 'var(--text-3)',
                      fontWeight: theme === opt.value ? 700 : 500,
                      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    <Icon name={opt.icon} size={18} color={theme === opt.value ? 'var(--accent-text)' : 'var(--text-3)'}/>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 16, marginBottom: 10 }}>ハイライトカラー</div>
            {mounted && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {ACCENT_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    title={preset.label}
                    onClick={() => setAccentId(preset.id)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
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

        {/* ワークスペース設定 */}
        <div style={{ margin: '24px 16px 0', fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', paddingLeft: 4 }}>ワークスペース</div>
        <SectionList sections={WORKSPACE_SECTIONS}/>

        {/* ログアウト */}
        <div style={{ margin: '24px 16px 0' }}>
          <button style={{ width: '100%', padding: '15px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--rose)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}
