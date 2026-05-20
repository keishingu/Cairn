'use client'

import { Icon } from '../../primitives'

export const FilesTab = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
    {[
      { name: '北アルプス縦走計画書_v2.pdf', size: '2.7MB · 5/21 08:30', kind: 'PDF', latest: true },
      { name: '北アルプス縦走計画書_v1.pdf', size: '2.4MB · 5/20 18:30', kind: 'PDF' },
      { name: '装備リスト.xlsx',             size: '18KB · 5/20 18:30',  kind: 'XLS' },
      { name: 'ルートマップ.gpx',            size: '45KB · 5/20 18:30',  kind: 'GPX' },
      { name: '緊急連絡先リスト.pdf',         size: '120KB · 5/19 22:10', kind: 'PDF' },
    ].map((f, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--divider)', borderRadius: 6, cursor: 'pointer' }}>
        <div style={{
          width: 32, height: 36, borderRadius: 4, flexShrink: 0,
          background: f.kind === 'PDF' ? 'var(--red-soft)' : f.kind === 'XLS' ? 'var(--emerald-soft)' : 'var(--blue-soft)',
          color: f.kind === 'PDF' ? 'var(--red-text)' : f.kind === 'XLS' ? 'var(--emerald-text)' : 'var(--blue-text)',
          fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{f.kind}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {f.name}
            {f.latest && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)' }}>最新</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.size}</div>
        </div>
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Icon name="more" size={14}/></button>
      </div>
    ))}
  </div>
)
