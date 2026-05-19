'use client'

import React from 'react'
import { Icon, Avatar, MountainPhoto } from '../primitives'

export const PageGallery = () => {
  const photos = Array.from({ length: 14 }).map((_, i) => ({
    h: 200 + ((i * 73) % 180),
    g: i,
    caption: ['槍ヶ岳山頂', '燕岳の朝焼け', '上高地・河童橋', '雷鳥との遭遇', '穂高連峰縦走', 'テント場の朝', '稜線歩き', '雪渓を渡る', '槍ヶ岳の影', '剱岳遠景'][i % 10],
    by: (['山田 太郎', '佐藤 花子', '鈴木 健', '田中 陽子'][i % 4] as string),
    date: ['5/12', '5/14', '5/15', '5/18', '5/20', '5/22'][i % 6],
    likes: 4 + ((i * 7) % 18),
    comments: ((i * 3) % 6),
  }))
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>ギャラリー</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>248 枚 · 8 プロジェクト</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>すべて <Icon name="chevDown" size={13}/></button>
            <button className="btn"><Icon name="filter" size={13}/> 並べ替え</button>
            <button className="btn btn-primary"><Icon name="plus" size={13}/> アップロード</button>
          </div>
        </div>
        <div style={{ columnCount: 4, columnGap: 12 }}>
          {photos.map((p, i) => (
            <div key={i} style={{
              breakInside: 'avoid', marginBottom: 12, borderRadius: 10, overflow: 'hidden',
              background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer', transition: 'transform .2s, box-shadow .2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
            >
              <MountainPhoto idx={p.g} height={p.h}/>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{p.caption}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Avatar name={p.by} size={16}/>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.by} · {p.date}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: 'var(--text-3)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Icon name="heart" size={12} color={i % 3 === 0 ? 'var(--rose)' : 'var(--text-3)'}/>{p.likes}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Icon name="chat" size={12}/>{p.comments}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <aside style={{ width: 320, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>選択中</h3>
          <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="close" size={15}/></button>
        </div>
        <MountainPhoto idx={1} height={200} flat/>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>燕岳の朝焼け</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Avatar name="佐藤 花子" size={20}/>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>佐藤 花子</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· 5/14 05:42</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--rose)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
              <Icon name="heart" size={14} color="var(--rose)"/> 22
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
              <Icon name="chat" size={14}/> 4
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>
              <Icon name="download" size={14}/>
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {[
            { n: '山田 太郎', t: 'すごい朝焼けですね！', d: '5/14 09:12' },
            { n: '鈴木 健',   t: 'これは生で見たい…！', d: '5/14 12:03' },
            { n: '田中 陽子', t: '構図がいい👏',       d: '5/14 18:50' },
          ].map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--divider)' }}>
              <Avatar name={c.n} size={26}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 1 }}>{c.n} <span style={{ fontWeight: 500, color: 'var(--text-4)', fontSize: 11 }}>{c.d}</span></div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{c.t}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px' }}>
            <input placeholder="コメントを追加…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', color: 'var(--text)' }}/>
            <button style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrowUp" size={11}/>
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
