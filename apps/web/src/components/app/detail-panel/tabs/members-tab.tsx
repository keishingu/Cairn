'use client'

import { Icon, Avatar } from '../../primitives'

export const MembersTab = () => {
  const list = [
    { n: '山田 太郎', r: 'リーダー',    c: 'var(--accent-text)', bg: 'var(--accent-soft)' },
    { n: '佐藤 花子', r: 'サブリーダー', c: 'var(--violet-text)', bg: 'var(--violet-soft)' },
    { n: '鈴木 健',   r: 'メンバー',    c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '田中 陽子', r: 'メンバー',    c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '伊藤 翔',   r: 'メンバー',    c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '高橋 美咲', r: 'メンバー',    c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '中村 拓也', r: 'メンバー',    c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '小林 大地', r: 'メンバー',    c: 'var(--text-3)', bg: 'var(--card-2)' },
  ]
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>参加中 (8)</button>
        <button style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>未確定 (2)</button>
      </div>
      {list.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--divider)' }}>
          <Avatar name={m.n} size={28}/>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.n}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: m.c, background: m.bg, padding: '2px 7px', borderRadius: 4 }}>{m.r}</span>
        </div>
      ))}
      <button style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="plus" size={13}/> メンバーを招待
      </button>
    </div>
  )
}
