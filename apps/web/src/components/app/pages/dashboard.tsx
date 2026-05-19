'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, StatusChip } from '../primitives'
import { PROJECTS, MEMBERS, STATUS_COL } from '../data'

interface PageDashboardProps {
  openPanel: () => void
}

export const PageDashboard = ({ openPanel }: PageDashboardProps) => {
  const stats = [
    { label: '進行中プロジェクト', value: 8,  delta: '+2',       c: 'var(--blue)' },
    { label: '今週の予定',         value: 12, delta: '5 件 今日',   c: 'var(--accent)' },
    { label: '未読メッセージ',     value: 23, delta: '6 チャンネル', c: 'var(--amber)' },
    { label: '完了タスク (今月)',  value: 47, delta: '+14',       c: 'var(--violet)' },
  ]
  return (
    <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 2 }}>2024年6月12日 水曜日</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>おはよう、太郎さん</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><Icon name="plus" size={14}/> 新規プロジェクト</button>
          <button className="btn btn-primary"><Icon name="sparkles" size={14}/> AIに相談</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: s.c }}>{s.delta}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>今日の予定</h3>
            <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              カレンダーを見る <Icon name="arrowRight" size={11}/>
            </button>
          </div>
          <div style={{ padding: '4px 18px 14px' }}>
            {[
              { t: '09:00', dur: '30m', n: '部活ミーティング', p: '北アルプス縦走計画', c: 'plan' as const },
              { t: '12:30', dur: '1h',  n: '装備チェック',     p: '夏山合宿計画',       c: 'wait' as const },
              { t: '15:00', dur: '45m', n: 'OB訪問',          p: 'クライミング講習会', c: 'review' as const },
              { t: '18:30', dur: '2h',  n: '練習会',           p: '沢登り練習会',       c: 'plan' as const },
            ].map((e, i) => {
              const cfg = STATUS_COL[e.c]
              return (
                <div key={i} onClick={() => openPanel()} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none', cursor: 'pointer', alignItems: 'center' }}>
                  <div style={{ width: 56, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{e.t}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600 }}>{e.dur}</div>
                  </div>
                  <div style={{ width: 3, height: 36, borderRadius: 2, background: cfg.bar, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{e.n}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{e.p}</div>
                  </div>
                  <AvatarStack names={MEMBERS.slice(0, 3 + (i % 2))} size={22} max={4}/>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 100% 0%, var(--accent-soft) 0%, transparent 50%)', pointerEvents: 'none' }}/>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Icon name="sparkles" size={12}/>
            </div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>AIからのサマリー</h3>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600 }}>AUTO-GENERATED · 30分前</span>
          </div>
          <div style={{ padding: '12px 18px 14px', position: 'relative' }}>
            <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
              現在 <b>3件</b> のプロジェクトで意思決定待ちです。<b>北アルプス縦走計画</b> は装備リストの最終化が必要。<b>夏山合宿計画</b> はテント場予約期限が迫っています。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { i: 'flag',  t: '計画書 v2 の審議承認を依頼する', p: '北アルプス縦走計画' },
                { i: 'tent',  t: 'テント場の予約期限まで 3日',     p: '夏山合宿計画' },
                { i: 'check', t: '緊急連絡先の最新化を完了させる', p: '雪山訓練' },
              ].map((a, i) => (
                <button key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)' }}>
                    <Icon name={a.i} size={13}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{a.t}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{a.p}</div>
                  </div>
                  <Icon name="chevRight" size={13} color="var(--text-3)"/>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, gridColumn: 'span 2' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>進行中のプロジェクト</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" style={{ height: 28 }}>すべて</button>
              <button className="btn btn-ghost" style={{ height: 28 }}>参加中</button>
              <button className="btn btn-ghost" style={{ height: 28 }}>主催</button>
            </div>
          </div>
          <div style={{ padding: '0 8px' }}>
            {PROJECTS.slice(0, 5).map((p, i) => (
              <div key={p.id} onClick={() => openPanel()} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 120px 100px 100px 80px',
                gap: 12, alignItems: 'center',
                padding: '12px 14px', borderBottom: i < 4 ? '1px solid var(--divider)' : 'none',
                cursor: 'pointer', borderRadius: 8,
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.accent, flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.dates}</div>
                <StatusChip s={p.status}/>
                <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 4))} size={22}/>
                <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="chat" size={12}/>{p.unread || 0}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12}/>{p.unread || 2}</span>
                </div>
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--divider)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, right: `${100 - (40 + i * 12)}%`, background: p.accent, borderRadius: 3 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
