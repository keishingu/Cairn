'use client'

import React from 'react'
import { Icon } from '../primitives'
import { STATUS_COL } from '../data'

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

const SettingsWorkflow = () => {
  const stages = [
    { id: 'plan',   label: '計画中',     c: STATUS_COL.plan },
    { id: 'review', label: '審議中',     c: STATUS_COL.review },
    { id: 'wait',   label: '実施待ち',   c: STATUS_COL.wait },
    { id: 'doing',  label: '実施中',     c: STATUS_COL.doing },
    { id: 'retro',  label: '振り返り中', c: STATUS_COL.retro },
    { id: 'done',   label: '完了',       c: STATUS_COL.done },
  ]
  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>ワークフロー</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>プロジェクトのステータス遷移とルールを管理します。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>ステージ</h2>
        <div className="card" style={{ padding: 6 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: i < 5 ? '1px solid var(--divider)' : 'none' }}>
              <Icon name="grip" size={16} color="var(--text-4)" style={{ cursor: 'grab' }}/>
              <span style={{ width: 28, height: 6, borderRadius: 3, background: s.c.bar }}/>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>承認 必須: {['—', '部長', '—', '—', '—', '—'][i]}</span>
              <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0 }}><Icon name="edit" size={12}/></button>
            </div>
          ))}
          <button style={{ width: '100%', padding: '10px', border: 'none', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="plus" size={13}/> ステージを追加
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>自動化ルール</h2>
        <div className="card" style={{ padding: 0 }}>
          {[
            { w: '審議中 → 実施待ち',   t: 'リーダーに通知 + チャットに自動投稿', on: true },
            { w: '実施中 → 振り返り中', t: 'ギャラリー自動アーカイブ',           on: true },
            { w: '完了から30日',         t: 'プロジェクトを自動アーカイブ',       on: false },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--divider)' : 'none' }}>
              <Icon name="flag" size={15} color="var(--accent)"/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.w}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{r.t}</div>
              </div>
              <Toggle on={r.on}/>
            </div>
          ))}
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
          { n: 'GPT-4o',      d: '汎用・推奨',     on: true },
          { n: 'GPT-4o mini', d: '高速・低コスト', on: false },
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
          { l: 'チャットで @AI でメンション呼び出し', s: '即時応答', on: true },
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

export const PageSettings = () => {
  const [section, setSection] = React.useState('workflow')
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 220, borderRight: '1px solid var(--border)', padding: '20px 14px', background: 'var(--card)' }}>
        <h2 style={{ margin: '0 8px 14px', fontSize: 16, fontWeight: 700 }}>設定</h2>
        {[
          { id: 'general',      l: '一般',         i: 'settings' },
          { id: 'workflow',     l: 'ワークフロー',  i: 'flag' },
          { id: 'ai',           l: 'AIエージェント', i: 'sparkles' },
          { id: 'members',      l: 'メンバー',     i: 'users' },
          { id: 'integrations', l: '連携',         i: 'layers' },
          { id: 'billing',      l: '請求',         i: 'archive' },
        ].map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '8px 10px', borderRadius: 7, border: 'none',
            background: section === s.id ? 'var(--card-hover)' : 'transparent',
            color: section === s.id ? 'var(--text)' : 'var(--text-2)',
            fontWeight: section === s.id ? 600 : 500,
            fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
          }}>
            <Icon name={s.i} size={14}/> {s.l}
          </button>
        ))}
      </aside>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
        {section === 'workflow' && <SettingsWorkflow/>}
        {section === 'ai' && <SettingsAI/>}
        {section !== 'workflow' && section !== 'ai' && (
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
              {{ general: '一般', members: 'メンバー', integrations: '連携', billing: '請求' }[section] ?? section}
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>このセクションの設定は準備中です。</p>
          </div>
        )}
      </div>
    </div>
  )
}
