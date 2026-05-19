'use client'

import React from 'react'
import { Icon, TypingDots } from '../primitives'

const AIInitialMessage = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
      <Icon name="sparkles" size={14}/>
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
        <p style={{ margin: '0 0 12px' }}>添付資料を確認しました。<b>北アルプス縦走計画（4泊5日・8名）</b>の装備について、主要なポイントを以下にまとめます。</p>
        <div style={{ background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.02em' }}>カテゴリ別 集計</div>
          {[
            { c: 'テント・寝具', n: 9,  s: '8人 / 4テント想定' },
            { c: '炊事・食料',  n: 12, s: '行動食 1日 4種類' },
            { c: '安全装備',   n: 7,  s: 'ヘッドランプ・救急セット' },
            { c: '個人装備',   n: 4,  s: 'ザック・雨具・防寒' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 50px 1fr', gap: 12, padding: '6px 0', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{r.c}</span>
              <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{r.n} 点</span>
              <span style={{ color: 'var(--text-3)' }}>{r.s}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '0 0 8px' }}><b style={{ color: 'var(--red)' }}>⚠ 要注意ポイント</b></p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.7 }}>
          <li>予備の <b>ガス缶</b> が 1個。8名・4泊なら<b>+2個</b>を推奨</li>
          <li>緊急用 <b>ツェルト</b> の記載がない</li>
          <li>気象遭難時の <b>予備食</b>（1日分以上）が明記されていない</li>
        </ul>
        <p style={{ margin: 0 }}>これらをチャットで議題として提起しますか？</p>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 6, fontSize: 11 }}>
        <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>👍</button>
        <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>👎</button>
        <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>コピー</button>
        <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>再生成</button>
      </div>
    </div>
  </div>
)

interface AiMsg {
  role: 'user' | 'ai'
  text: string
  initial?: boolean
}

export const PageAI = () => {
  const conversations = [
    { id: 'c1', title: '北アルプス装備リスト要約', active: true, when: '今日' },
    { id: 'c2', title: '緊急連絡網の最適化',       when: '今日' },
    { id: 'c3', title: '夏山合宿の日程候補',       when: '今日' },
    { id: 'c4', title: 'OB訪問の議事録要約',       when: '今日' },
    { id: 'c5', title: '雪山訓練の場所候補',       when: '今週' },
    { id: 'c6', title: '計画書テンプレート生成',   when: '今週' },
    { id: 'c7', title: 'リスクアセスメント',       when: '今週' },
  ]
  const [msgs, setMsgs] = React.useState<AiMsg[]>([
    { role: 'user', text: '添付した装備リストと計画書を確認して、不足しているものや要注意点を洗い出してください。' },
    { role: 'ai',   text: '', initial: true },
  ])
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs.length, busy])

  const send = async (q?: string) => {
    const question = (q ?? draft).trim()
    if (!question || busy) return
    setMsgs(prev => [...prev, { role: 'user', text: question }])
    setDraft('')
    setBusy(true)
    // Simulate AI response (in real app, call OpenAI API)
    await new Promise(r => setTimeout(r, 1500))
    setMsgs(prev => [...prev, { role: 'ai', text: `「${question}」についての回答です。安全を最優先に、計画書の内容をもとに検討した結果をお伝えします。詳細な分析と具体的な提案が必要な場合は、関連するファイルをアップロードしてください。` }])
    setBusy(false)
  }

  const suggestions = ['予備日程を提案', '緊急連絡網テンプレ', 'ルートリスク評価', 'チャットに展開']

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13}/> 新しい会話
          </button>
        </div>
        <div style={{ padding: '0 8px 12px', overflow: 'auto' }}>
          {['今日', '今週'].map(group => (
            <React.Fragment key={group}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '8px 10px', textTransform: 'uppercase' }}>{group}</div>
              {conversations.filter(c => c.when === group).map(c => (
                <button key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: c.active ? 'var(--card-hover)' : 'transparent',
                  color: 'var(--text-2)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Icon name="chat" size={13} color="var(--text-3)"/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)' }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon name="sparkles" size={14}/>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>北アルプス装備リスト要約</h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>2 ファイルを参照中 · プロジェクト: 北アルプス縦走計画</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 30 }}><Icon name="archive" size={13}/></button>
            <button className="btn btn-ghost" style={{ height: 30 }}><Icon name="more" size={14}/></button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '24px 0' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '78%', background: 'var(--card-hover)', border: '1px solid var(--border)', borderRadius: '14px 14px 4px 14px', padding: '10px 14px', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {m.text}
                </div>
              </div>
            ) : m.initial ? (
              <AIInitialMessage key={i}/>
            ) : (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <Icon name="sparkles" size={14}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>👍</button>
                    <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>👎</button>
                    <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}>コピー</button>
                  </div>
                </div>
              </div>
            ))}
            {busy && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <Icon name="sparkles" size={14}/>
                </div>
                <div style={{ paddingTop: 6, color: 'var(--text-3)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <TypingDots/> 考えています…
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 28px 18px', background: 'var(--bg)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} disabled={busy} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                  background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)',
                  cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
                }}>{s}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 14, padding: '10px 12px 10px 14px', boxShadow: 'var(--shadow-sm)' }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                placeholder="質問を入力 (Shift+Enterで改行)"
                rows={1}
                disabled={busy}
                style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 13.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '4px 0', minHeight: 22, maxHeight: 120 }}/>
              <button style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="paperclip" size={16}/>
              </button>
              <button onClick={() => void send()} disabled={!draft.trim() || busy} style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                background: (draft.trim() && !busy) ? 'var(--accent)' : 'var(--border-2)',
                color: (draft.trim() && !busy) ? 'var(--on-accent)' : 'var(--text-4)',
                cursor: (draft.trim() && !busy) ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name="arrowUp" size={14}/></button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-4)', textAlign: 'center' }}>
              AIは間違えることもあります。重要な判断は安全を優先してリーダーに相談してください。
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
