// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { MobileHeader } from '../mobile-header'
import { Icon, StatusChip } from '../../primitives'
import { PROJECTS, STATUS, type StatusKey } from '../../data'

const STATS = [
  { label: 'プロジェクト', value: '8', icon: 'folder',  color: 'var(--accent)' },
  { label: '進行中',       value: '7', icon: 'flag',    color: 'var(--emerald)' },
  { label: 'タスク',       value: '12', icon: 'check',  color: 'var(--amber)' },
  { label: '未読',         value: '18', icon: 'bell',   color: 'var(--rose)' },
]

export function MobileDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="ダッシュボード" right={
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
          <Icon name="bell" size={20}/>
        </button>
      }/>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>おはようございます 👋</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>山田 太郎</div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={s.icon} size={16} color={s.color}/>
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Active projects */}
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>進行中のプロジェクト</div>
          <button style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>すべて見る</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PROJECTS.filter(p => p.status !== 'done').slice(0, 4).map((p, i) => {
            const cfg = STATUS[p.status]
            return (
              <div key={p.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="mountain" size={18} color={cfg.dot}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusChip s={p.status}/>
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{p.dates}</span>
                  </div>
                </div>
                {p.unread > 0 && (
                  <div style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{p.unread}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Today's schedule */}
        <div style={{ marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>今日の予定</div>
        {[
          { time: '10:00', title: '装備確認ミーティング', project: '北アルプス縦走計画' },
          { time: '14:00', title: 'ルート最終確認',       project: '夏山合宿計画' },
          { time: '18:00', title: '部室集合・申し込み',   project: 'クライミング講習会' },
        ].map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i > 0 ? '1px solid var(--divider)' : 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', width: 44, flexShrink: 0 }}>{ev.time}</div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{ev.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="folder" size={10}/> {ev.project}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
