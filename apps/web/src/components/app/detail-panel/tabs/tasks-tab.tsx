'use client'

import { Icon, Avatar } from '../../primitives'

export const TasksTab = () => {
  const tasks = [
    { d: '6/5',  t: '計画書を最新版に更新する', p: '高', done: false, a: '山田' },
    { d: '6/6',  t: '装備リストを確定する',     p: '中', done: false, a: '佐藤' },
    { d: '6/8',  t: 'テント場を予約する',       p: '中', done: false, a: '鈴木' },
    { d: '6/10', t: '予備日程を検討する',       p: '低', done: false, a: '田中' },
    { d: '5/18', t: 'ルート案を作成する',       p: '',   done: true,  a: '山田' },
    { d: '5/18', t: 'メンバーの参加可否確認',   p: '',   done: true,  a: '佐藤' },
  ]
  const pmap: Record<string, string> = { '高': 'var(--red)', '中': 'var(--amber)', '低': 'var(--text-3)' }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '4px 0 6px', letterSpacing: '0.04em' }}>未完了</div>
      {tasks.filter(t => !t.done).map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--border-2)' }}/>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{t.t}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: pmap[t.p], padding: '2px 6px', borderRadius: 4, background: 'var(--card-2)' }}>{t.p}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.d}</span>
          <Avatar name={t.a} size={20}/>
        </div>
      ))}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '14px 0 6px', letterSpacing: '0.04em' }}>完了</div>
      {tasks.filter(t => t.done).map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
            <Icon name="check" size={10} strokeWidth={3}/>
          </div>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'line-through' }}>{t.t}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.d}</span>
          <Avatar name={t.a} size={20}/>
        </div>
      ))}
    </div>
  )
}
