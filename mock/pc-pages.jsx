/* global React, Icon, Avatar, AvatarStack, StatusChip, STATUS, Sidebar, TopBar, CalendarGrid, KanbanBoard, KanbanCard, ProjectPanel, PROJECTS, MEMBERS, STATUS_COL */
// pc-pages.jsx — full-page views (Dashboard, Calendar+Kanban hero, Kanban full, Gallery, AI, Settings)

// ─── Page: Calendar (full-height month view) ─────────────────────
const PageCalendar = ({ openPanel, panelOpen }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" style={{ height: 32 }}>今日</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center', height: 32 }}><Icon name="chevLeft" size={15}/></button>
          <button className="btn btn-ghost" style={{ width: 32, padding: 0, justifyContent: 'center', height: 32 }}><Icon name="chevRight" size={15}/></button>
        </div>
        <button className="btn btn-ghost" style={{ height: 32, fontWeight: 700, fontSize: 16, padding: '0 8px' }}>
          2024年6月 <Icon name="chevDown" size={14}/>
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn"><Icon name="filter" size={13}/> フィルター</button>
        <div style={{ display: 'flex', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 0 }}>
          {['月', '週', 'リスト'].map((v, i) => (
            <button key={v} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none',
              background: i === 0 ? 'var(--card)' : 'transparent',
              color: i === 0 ? 'var(--text)' : 'var(--text-3)',
              fontSize: 12.5, fontWeight: i === 0 ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: i === 0 ? 'var(--shadow-sm)' : 'none',
            }}>{v}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ height: 32 }}>
          <Icon name="plus" size={13} strokeWidth={2.4}/> 予定を作成
        </button>
      </div>
    </div>
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <CalendarGrid onPickProject={openPanel}/>
    </div>
    {/* Legend */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
      {['plan', 'review', 'wait', 'doing', 'retro', 'done'].map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COL[s].bg, borderLeft: `2px solid ${STATUS_COL[s].bar}` }}/>
          {STATUS[s].label}
        </span>
      ))}
    </div>
  </div>
);

// ─── Page: Projects (list view) ──────────────────────────────────
const PageProjects = ({ openPanel }) => {
  const [view, setView] = React.useState('grid'); // grid | table
  const [filter, setFilter] = React.useState('all');
  const [createOpen, setCreateOpen] = React.useState(false);
  const counts = {
    all: PROJECTS.length,
    mine: 5, owned: 3,
    active: PROJECTS.filter(p => !['done'].includes(p.status)).length,
    archived: 0,
  };
  return (
    <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'auto' }}>
      {/* Filter chips + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all',     l: 'すべて',   n: counts.all },
            { id: 'mine',    l: '参加中',   n: counts.mine },
            { id: 'owned',   l: '主催',     n: counts.owned },
            { id: 'active',  l: '進行中',   n: counts.active },
            { id: 'archived',l: 'アーカイブ', n: counts.archived },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: filter === f.id ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: filter === f.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {f.l}
              <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ display: 'flex', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {[
              { id: 'grid',  i: 'kanban', l: 'カード' },
              { id: 'table', i: 'list',   l: 'テーブル' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: view === v.id ? 'var(--card)' : 'transparent',
                color: view === v.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: 12, fontWeight: view === v.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: view === v.id ? 'var(--shadow-sm)' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}><Icon name={v.i} size={12}/> {v.l}</button>
            ))}
          </div>
          <button className="btn"><Icon name="filter" size={13}/> フィルター</button>
          <button onClick={() => setCreateOpen(true)} className="btn btn-primary"><Icon name="plus" size={13}/> 新規プロジェクト</button>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {PROJECTS.map((p, i) => (
            <div key={p.id} onClick={() => openPanel(p.id)} style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
              overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
              transition: 'transform .15s, box-shadow .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
            >
              <div style={{ position: 'relative' }}>
                <MountainPhoto idx={i + 2} height={120} flat/>
                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                  <StatusChip s={p.status}/>
                </div>
                {p.unread > 0 && (
                  <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
                    {p.unread} 未読
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{p.dates} · {p.members}人</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 4))} size={22}/>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="chat" size={12}/>{p.unread || 0}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12}/>{2 + i}</span>
                  </div>
                </div>
                <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${30 + (i*9) % 60}%`, background: p.accent, borderRadius: 3 }}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 80px 32px',
            gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            <span></span><span>プロジェクト</span><span>ステータス</span><span>日程</span><span>メンバー</span><span>進捗</span><span style={{ textAlign: 'right' }}>未読</span><span></span>
          </div>
          {PROJECTS.map((p, i) => (
            <div key={p.id} onClick={() => openPanel(p.id)} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 80px 32px',
              gap: 16, padding: '12px 16px', borderBottom: i < PROJECTS.length - 1 ? '1px solid var(--divider)' : 'none',
              alignItems: 'center', cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--card-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.accent }}/>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
              <StatusChip s={p.status}/>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{p.dates}</span>
              <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 4))} size={22}/>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${30 + (i*9) % 60}%`, background: p.accent, borderRadius: 3 }}/>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: p.unread > 0 ? 'var(--accent-text)' : 'var(--text-3)', textAlign: 'right' }}>{p.unread || '—'}</span>
              <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="more" size={14}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
    <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)}/>
    </>
  );
};

// ─── Page: Dashboard ─────────────────────────────────────────────
const PageDashboard = ({ openPanel }) => {
  const stats = [
    { label: '進行中プロジェクト', value: 8,  delta: '+2',   c: 'var(--blue)' },
    { label: '今週の予定',         value: 12, delta: '5 件 今日',  c: 'var(--accent)' },
    { label: '未読メッセージ',     value: 23, delta: '6 チャンネル', c: 'var(--amber)' },
    { label: '完了タスク (今月)',  value: 47, delta: '+14',  c: 'var(--violet)' },
  ];
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

      {/* Stats */}
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
        {/* Today schedule */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>今日の予定</h3>
            <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              カレンダーを見る <Icon name="arrowRight" size={11}/>
            </button>
          </div>
          <div style={{ padding: '4px 18px 14px' }}>
            {[
              { t: '09:00', dur: '30m', n: '部活ミーティング', p: '北アルプス縦走計画', c: 'plan' },
              { t: '12:30', dur: '1h',  n: '装備チェック',     p: '夏山合宿計画',       c: 'wait' },
              { t: '15:00', dur: '45m', n: 'OB訪問',          p: 'クライミング講習会', c: 'review' },
              { t: '18:30', dur: '2h',  n: '練習会',           p: '沢登り練習会',       c: 'plan' },
            ].map((e, i) => {
              const cfg = STATUS_COL[e.c];
              return (
                <div key={i} onClick={() => openPanel('p1')} style={{
                  display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none', cursor: 'pointer', alignItems: 'center',
                }}>
                  <div style={{ width: 56, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{e.t}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600 }}>{e.dur}</div>
                  </div>
                  <div style={{ width: 3, height: 36, borderRadius: 2, background: cfg.bar, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{e.n}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{e.p}</div>
                  </div>
                  <AvatarStack names={MEMBERS.slice(0, 3 + (i%2))} size={22} max={4}/>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI summary */}
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
                { i: 'flag', t: '計画書 v2 の審議承認を依頼する', p: '北アルプス縦走計画' },
                { i: 'tent', t: 'テント場の予約期限まで 3日',     p: '夏山合宿計画' },
                { i: 'check', t: '緊急連絡先の最新化を完了させる', p: '雪山訓練' },
              ].map((a, i) => (
                <button key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}>
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

        {/* Active projects */}
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
              <div key={p.id} onClick={() => openPanel(p.id)} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 120px 100px 100px 80px',
                gap: 12, alignItems: 'center',
                padding: '12px 14px', borderBottom: i < 4 ? '1px solid var(--divider)' : 'none',
                cursor: 'pointer', borderRadius: 8,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
                <div style={{
                  width: '100%', height: 6, borderRadius: 3, background: 'var(--divider)', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', inset: 0, right: `${100 - (40 + i*12)}%`, background: p.accent, borderRadius: 3 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Page: Kanban (full board) ───────────────────────────────────
const PageKanban = ({ openPanel }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn"><Icon name="filter" size={13}/> フィルター</button>
        <button className="btn">グループ: ステータス <Icon name="chevDown" size={13}/></button>
        <button className="btn">すべてのプロジェクト <Icon name="chevDown" size={13}/></button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn"><Icon name="settings" size={13}/> ステージ設定</button>
        <button className="btn btn-primary"><Icon name="plus" size={13}/> 新規プロジェクト</button>
      </div>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      <KanbanBoard onCardClick={openPanel}/>
    </div>
  </div>
);

// ─── Page: Gallery ───────────────────────────────────────────────
const PageGallery = () => {
  // Pseudo-photo SVGs using mountain silhouettes + sky gradients
  const photos = Array.from({ length: 14 }).map((_, i) => ({
    h: 200 + ((i * 73) % 180),
    g: i,
    caption: ['槍ヶ岳山頂', '燕岳の朝焼け', '上高地・河童橋', '雷鳥との遭遇', '穂高連峰縦走', 'テント場の朝', '稜線歩き', '雪渓を渡る', '槍ヶ岳の影', '剱岳遠景'][i % 10],
    by: ['山田 太郎', '佐藤 花子', '鈴木 健', '田中 陽子'][i % 4],
    date: ['5/12', '5/14', '5/15', '5/18', '5/20', '5/22'][i % 6],
    likes: 4 + ((i * 7) % 18),
    comments: ((i * 3) % 6),
  }));
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>ギャラリー</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>248 枚 · 8 プロジェクト</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn">すべて <Icon name="chevDown" size={13}/></button>
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
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
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
                    <Icon name="heart" size={12} color={i%3===0 ? 'var(--rose)' : 'var(--text-3)'}/>{p.likes}
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
      {/* Right panel — selected photo + comments */}
      <aside style={{ width: 320, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>選択中</h3>
          <button style={{ border:'none', background:'transparent', color:'var(--text-3)', cursor:'pointer' }}><Icon name="close" size={15}/></button>
        </div>
        <MountainPhoto idx={1} height={200} flat/>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>燕岳の朝焼け</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Avatar name="佐藤 花子" size={20}/>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>佐藤 花子</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· 5/14 05:42</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-2)' }}>
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
            { n: '鈴木 健', t: 'これは生で見たい…！', d: '5/14 12:03' },
            { n: '田中 陽子', t: '構図がいい👏', d: '5/14 18:50' },
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
  );
};

// Drawn "photo" — see photos.jsx for MountainPhoto definition (real Unsplash photos)

// ─── Page: AI Assistant (full page) ──────────────────────────────
const PageAI = () => {
  const [conversations] = React.useState([
    { id: 'c1', title: '北アルプス装備リスト要約', active: true, when: '今日' },
    { id: 'c2', title: '緊急連絡網の最適化',       when: '今日' },
    { id: 'c3', title: '夏山合宿の日程候補',       when: '今日' },
    { id: 'c4', title: 'OB訪問の議事録要約',       when: '今日' },
    { id: 'c5', title: '雪山訓練の場所候補',       when: '今週' },
    { id: 'c6', title: '計画書テンプレート生成',   when: '今週' },
    { id: 'c7', title: 'リスクアセスメント',       when: '今週' },
  ]);
  const [msgs, setMsgs] = React.useState([
    { role: 'user', text: '添付した装備リストと計画書を確認して、不足しているものや要注意点を洗い出してください。' },
    { role: 'ai',   text: 'INITIAL_AI', initial: true },
  ]);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length, busy]);

  const send = async (q) => {
    const question = (q ?? draft).trim();
    if (!question || busy) return;
    setMsgs(prev => [...prev, { role: 'user', text: question }]);
    setDraft('');
    setBusy(true);
    try {
      const prompt =
        `あなたは山岳部の活動を支援するアシスタントです。安全を最優先に、計画書・装備・気象情報をもとに具体的で簡潔な提案を行ってください。マークダウンや絵文字は控えめに、日本語で答えてください。\n\n` +
        `参考情報:\n- プロジェクト: 北アルプス縦走計画（4泊5日・8名）\n- 添付ファイル: 装備リスト.xlsx / 北アルプス縦走計画書_v2.pdf\n\n` +
        `質問: ${question}`;
      const text = await window.claude.complete(prompt);
      setMsgs(prev => [...prev, { role: 'ai', text }]);
    } catch (err) {
      setMsgs(prev => [...prev, { role: 'ai', text: `エラーが発生しました: ${err && err.message ? err.message : err}` }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = ['予備日程を提案', '緊急連絡網テンプレ', 'ルートリスク評価', 'チャットに展開'];

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
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
                  <div style={{ marginTop: 12, display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
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
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 10,
              background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 14,
              padding: '10px 12px 10px 14px', boxShadow: 'var(--shadow-sm)',
            }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="質問を入力 (Shift+Enterで改行)"
                rows={1}
                disabled={busy}
                style={{
                  flex: 1, border: 'none', background: 'transparent', resize: 'none',
                  fontSize: 13.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                  lineHeight: 1.5, padding: '4px 0', minHeight: 22, maxHeight: 120,
                }}/>
              <button style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="paperclip" size={16}/>
              </button>
              <button onClick={() => send()} disabled={!draft.trim() || busy} style={{
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
  );
};

const TypingDots = () => (
  <span style={{ display: 'inline-flex', gap: 3 }}>
    {[0,1,2].map(i => (
      <span key={i} style={{
        width: 5, height: 5, borderRadius: '50%', background: 'var(--text-3)',
        animation: `typingPulse 1.2s ${i * 0.15}s ease-in-out infinite`,
      }}/>
    ))}
    <style>{`@keyframes typingPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }`}</style>
  </span>
);

// The seed AI response — formatted with a table-ish summary. Lives in its own
// component because the markup is rich. After this, follow-ups come from the
// real Claude call and render as plain text.
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
            { c: '安全装備',     n: 7,  s: 'ヘッドランプ・救急セット' },
            { c: '個人装備',     n: 4,  s: 'ザック・雨具・防寒' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 50px 1fr', gap: 12, padding: '6px 0', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{r.c}</span>
              <span style={{ color: 'var(--accent-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.n} 点</span>
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
);

// ─── Page: Settings ──────────────────────────────────────────────
const PageSettings = () => {
  const [section, setSection] = React.useState('workflow');
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 220, borderRight: '1px solid var(--border)', padding: '20px 14px', background: 'var(--card)' }}>
        <h2 style={{ margin: '0 8px 14px', fontSize: 16, fontWeight: 700 }}>設定</h2>
        {[
          { id: 'general',  l: '一般',       i: 'settings' },
          { id: 'workflow', l: 'ワークフロー', i: 'flag' },
          { id: 'ai',       l: 'AIエージェント', i: 'sparkles' },
          { id: 'members',  l: 'メンバー',   i: 'users' },
          { id: 'integrations', l: '連携', i: 'layers' },
          { id: 'billing',  l: '請求',       i: 'archive' },
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
              {{general:'一般', members:'メンバー', integrations:'連携', billing:'請求'}[section]}
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>このセクションの設定は準備中です。</p>
          </div>
        )}
      </div>
    </div>
  );
};

const SettingsWorkflow = () => {
  const stages = [
    { id: 'plan',   label: '計画中',   c: STATUS_COL.plan },
    { id: 'review', label: '審議中',   c: STATUS_COL.review },
    { id: 'wait',   label: '実施待ち', c: STATUS_COL.wait },
    { id: 'doing',  label: '実施中',   c: STATUS_COL.doing },
    { id: 'retro',  label: '振り返り中', c: STATUS_COL.retro },
    { id: 'done',   label: '完了',     c: STATUS_COL.done },
  ];
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
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>承認 必須: {['—','部長','—','—','—','—'][i]}</span>
              <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0 }}><Icon name="edit" size={12}/></button>
            </div>
          ))}
          <button style={{
            width: '100%', padding: '10px', border: 'none', background: 'transparent', color: 'var(--text-3)',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Icon name="plus" size={13}/> ステージを追加
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>自動化ルール</h2>
        <div className="card" style={{ padding: 0 }}>
          {[
            { w: '審議中 → 実施待ち', t: 'リーダーに通知 + チャットに自動投稿', on: true },
            { w: '実施中 → 振り返り中', t: 'ギャラリー自動アーカイブ', on: true },
            { w: '完了から30日', t: 'プロジェクトを自動アーカイブ', on: false },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--divider)' : 'none' }}>
              <Icon name="flag" size={15} color="var(--accent)" />
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
  );
};

const SettingsAI = () => (
  <div style={{ maxWidth: 780 }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>AIエージェント</h1>
    <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>各プロジェクトに常駐するAIアシスタントの動作を設定します。</p>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>モデル</h2>
      <div className="card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { n: 'GPT-4o',      d: '汎用・推奨',     on: true  },
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
      <textarea defaultValue={'山岳部の活動を支援するアシスタントとして、安全を最優先に、計画書・装備・気象情報をもとに具体的な提案を行ってください。'}
        rows={5} style={{
          width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
          resize: 'vertical', outline: 'none',
        }}/>
    </section>
  </div>
);

const Toggle = ({ on }) => (
  <div style={{
    width: 36, height: 20, borderRadius: 999, padding: 2,
    background: on ? 'var(--accent)' : 'var(--border-2)',
    transition: 'background .15s', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
    justifyContent: on ? 'flex-end' : 'flex-start',
  }}>
    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }}/>
  </div>
);

Object.assign(window, { PageCalendar, PageProjects, PageDashboard, PageKanban, PageGallery, PageAI, PageSettings });
