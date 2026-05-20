// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { MobileHeader } from '../mobile-header'
import { Icon, Avatar } from '../../primitives'

const SECTIONS = [
  {
    title: 'アカウント',
    items: [
      { icon: 'users',    label: 'プロフィール編集', value: '山田 太郎' },
      { icon: 'bell',     label: '通知設定',         value: 'オン' },
    ],
  },
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

export function MobileSettings() {
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

        {SECTIONS.map(section => (
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

        <div style={{ margin: '24px 16px 0' }}>
          <button style={{ width: '100%', padding: '15px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--rose)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}
