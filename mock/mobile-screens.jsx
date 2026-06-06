/* global React, Icon, Avatar, AvatarStack, StatusChip, STATUS, IOSDevice, MEMBERS, PROJECTS, STATUS_COL, MountainPhoto */
// mobile-screens.jsx — iPhone-framed mobile views

// Theme context — set by Phone in main.jsx so the same mobile screen renders
// in whichever theme (light/dark) the tweak is set to. Without this, every
// MobileShell was using a hardcoded "dark" attr → mobile light theme was a no-op.
const MobileThemeCtx = React.createContext('dark');

// Common: mobile theme wrapper
const MobileShell = ({ children }) => {
  const theme = React.useContext(MobileThemeCtx);
  return (
    <div data-theme={theme} style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'Inter, "Noto Sans JP", -apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>{children}</div>
  );
};

// Status bar (matches iOS frame's coloring)
const MobileTopBar = ({ left, center, right, dense, sub }) => (
  <div style={{
    padding: '52px 16px 12px',
    display: 'flex', alignItems: 'center', gap: 10, flexDirection: 'column',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <div style={{ minWidth: 28, display: 'flex' }}>{left}</div>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{center}</div>
      <div style={{ minWidth: 28, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>{right}</div>
    </div>
    {sub && <div style={{ width: '100%', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>}
  </div>
);

const MTabBar = ({ active, items }) => (
  <div style={{
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'var(--card)', borderTop: '1px solid var(--border)',
    padding: '8px 8px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    zIndex: 5,
  }}>
    {items.map((it, i) => (
      <button key={i} style={{
        border: 'none', background: 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        color: it.id === active ? 'var(--accent)' : 'var(--text-4)',
        padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Icon name={it.icon} size={20} strokeWidth={it.id === active ? 2.2 : 1.7}/>
        <span style={{ fontSize: 10, fontWeight: it.id === active ? 700 : 500 }}>{it.label}</span>
      </button>
    ))}
  </div>
);

const TAB_HOME = [
  { id: 'home',     label: 'ホーム',      icon: 'home' },
  { id: 'projects', label: 'プロジェクト', icon: 'kanban' },
  { id: 'chat',     label: 'チャット',    icon: 'chat' },
  { id: 'tasks',    label: 'タスク',      icon: 'check' },
  { id: 'menu',     label: 'メニュー',    icon: 'list' },
];

// ─── Screen: Project list (home) ─────────────────────────────────
const MProjectList = () => (
  <MobileShell>
    <div style={{ padding: '52px 16px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Icon name="list" size={22} color="var(--text)"/>
      <h1 style={{ flex: 1, margin: 0, fontSize: 20, fontWeight: 700 }}>プロジェクト一覧</h1>
      <Icon name="search" size={20} color="var(--text)"/>
      <div style={{ position: 'relative' }}>
        <Icon name="bell" size={20} color="var(--text)"/>
        <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--rose)', border: '2px solid var(--bg)' }}/>
      </div>
    </div>
    {/* Segments */}
    <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 8 }}>
      {[['すべて', true], ['参加中', false], ['主催', false], ['お気に入り', false]].map(([l, on], i) => (
        <button key={i} style={{
          padding: '6px 14px', borderRadius: 999,
          background: on ? 'var(--accent)' : 'var(--card)',
          color: on ? 'var(--on-accent)' : 'var(--text-2)',
          border: on ? 'none' : '1px solid var(--border)',
          fontSize: 12.5, fontWeight: on ? 700 : 500,
          fontFamily: 'inherit',
        }}>{l}</button>
      ))}
    </div>
    {/* List */}
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 100px' }}>
      {PROJECTS.slice(0, 5).map((p, i) => (
        <div key={p.id} style={{
          background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)',
          padding: 10, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
            <MountainPhoto idx={i} height={72} flat/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>{p.dates}</div>
            <div style={{ marginBottom: 6 }}><StatusChip s={p.status} size={10.5}/></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 3))} size={18} max={3}/>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.members}人</span>
            </div>
          </div>
          {p.unread > 0 && (
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--on-accent)',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{p.unread}</div>
          )}
        </div>
      ))}
    </div>
    <button style={{
      position: 'absolute', right: 16, bottom: 96, width: 52, height: 52, borderRadius: '50%',
      background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 24px rgba(16,185,129,0.4)', cursor: 'pointer', zIndex: 6,
    }}><Icon name="plus" size={22} strokeWidth={2.4}/></button>
    <MTabBar active="home" items={TAB_HOME}/>
  </MobileShell>
);

// ─── Screen: Project detail / Chat ───────────────────────────────
const MProjectChat = () => {
  const [tab, setTab] = React.useState('chat');
  const tabs = [
    { id: 'chat', l: 'チャット', i: 'chat' },
    { id: 'file', l: 'ファイル', i: 'file' },
    { id: 'task', l: 'タスク',   i: 'check' },
    { id: 'mem',  l: 'メンバー', i: 'users' },
    { id: 'gal',  l: 'ギャラリー', i: 'image' },
    { id: 'over', l: '概要',     i: 'list' },
    { id: 'ai',   l: 'AI',       i: 'sparkles' },
  ];
  return (
  <MobileShell>
    {/* Header hero */}
    <div style={{ height: 180, position: 'relative', flexShrink: 0 }}>
      <MountainPhoto idx={2} height={180} flat/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.3), transparent 50%, rgba(0,0,0,0.5))' }}/>
      <div style={{ position: 'absolute', top: 50, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="chevLeft" size={22} color="#fff"/>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#fff' }}>北アルプス縦走計画</span>
        <Icon name="more" size={22} color="#fff"/>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>6/12 (水) ~ 6/16 (日)</div>
        <div style={{ fontSize: 12, opacity: 0.95 }}>4泊5日 · 8人参加</div>
      </div>
    </div>
    <div style={{ padding: '10px 16px 8px' }}>
      <button style={{
        height: 30, padding: '0 12px', borderRadius: 999, border: 'none',
        background: 'var(--blue-soft)', color: 'var(--blue-text)',
        fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)' }}/>
        計画中 <Icon name="chevDown" size={12}/>
      </button>
    </div>
    {/* Tabs */}
    <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', overflowX: 'auto', padding: '0 8px' }}>
      {tabs.map(t => {
        const on = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flexShrink: 0, padding: '12px 14px', border: 'none', background: 'transparent',
            color: on ? 'var(--accent)' : 'var(--text-3)',
            fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Icon name={t.i} size={14}/> {t.l}
          </button>
        );
      })}
    </div>
    {tab === 'ai' ? <MProjectAITab/> : (
    <>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 16px' }}>
      {/* Pinned */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', marginBottom: 6, paddingLeft: 4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="pin" size={11}/> ピン留め
        </div>
        <div style={{
          background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 28, height: 32, borderRadius: 4, background: 'var(--red-soft)', color: 'var(--red-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>PDF</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>北アルプス縦走計画書_v1.pdf</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>PDF · 2.4MB · 5/20 18:30</div>
          </div>
          <Icon name="pin" size={14} color="var(--accent)"/>
        </div>
      </div>
      {/* Messages */}
      {[
        { n: '山田 太郎', t: '5/20 18:30', text: '北アルプス縦走の計画書をアップしました。\n日程やルート、装備リストを確認して意見をお願いします！', r: [{e:'👍', c: 3}] },
        { n: '佐藤 花子', t: '5/20 19:15', text: '日程はこのままで大丈夫そうです！\n1日目のテント場はもう少し標高を下げた方が安全かも？', r: [{e:'👍', c: 2}] },
      ].map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Avatar name={m.n} size={28}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{m.n} <span style={{ fontWeight: 500, color: 'var(--text-4)' }}>{m.t}</span></div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{m.text}</div>
            {m.r && (
              <div style={{ marginTop: 6 }}>
                {m.r.map((rr, j) => (
                  <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 22, padding: '0 7px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                    {rr.e} {rr.c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    {/* Input */}
    <div style={{ position: 'absolute', bottom: 88, left: 0, right: 0, padding: '8px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 22, padding: '8px 12px' }}>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-4)' }}>メッセージを入力…</span>
        <Icon name="paperclip" size={18} color="var(--text-3)"/>
        <Icon name="smile" size={18} color="var(--text-3)"/>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', border: '1.5px solid var(--text-3)', borderRadius: 4, padding: '1px 4px' }}>GIF</span>
      </div>
    </div>
    </>
    )}
    <MTabBar active="home" items={TAB_HOME}/>
  </MobileShell>
  );
};

// AI tab body for MProjectChat — modeled after MAI but compact (no header/topbar).
const MProjectAITab = () => (
  <>
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 160px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ maxWidth: '82%', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: '16px 16px 4px 16px', padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }}>
          このプロジェクトの装備リストを要約して
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          <Icon name="sparkles" size={13}/>
        </div>
        <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          装備リストを確認しました。テント・ガス缶・行動食の3カテゴリーで <b style={{ color: 'var(--text)' }}>32点</b>。<br/>
          不足の可能性: 予備ガス缶（推奨 +2個）。
        </div>
      </div>
      <div style={{ marginBottom: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>参考</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['装備リスト.xlsx', '北アルプス縦走計画書_v2.pdf'].map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
            <Icon name="file" size={13} color="var(--text-3)"/>
            <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 92 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
        {['天候による予備日程を提案', 'ルート上の山小屋を一覧化', '緊急時の下山ルート'].map((s, i) => (
          <button key={i} style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 999,
            background: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
          }}>{s}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 22, padding: '8px 8px 8px 14px' }}>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-4)' }}>AIに質問…</span>
        <Icon name="mic" size={18} color="var(--text-3)"/>
        <button style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="arrowUp" size={14}/>
        </button>
      </div>
    </div>
  </>
);

// ─── Screen: Files ───────────────────────────────────────────────
const MFiles = () => (
  <MobileShell>
    <MobileTopBar
      left={<Icon name="chevLeft" size={22} color="var(--text)"/>}
      center="ファイル"
      right={<Icon name="more" size={22} color="var(--text)"/>}
    />
    <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', padding: '0 16px' }}>
      <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13.5, fontWeight: 700, borderBottom: '2px solid var(--accent)', fontFamily: 'inherit' }}>ファイル</button>
      <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit' }}>承認フロー</button>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 100px' }}>
      {[
        { n: '北アルプス縦走計画書_v2.pdf', s: '2.7MB · 5/21 08:30', k: 'PDF', latest: true, c: 'red' },
        { n: '北アルプス縦走計画書_v1.pdf', s: '2.4MB · 5/20 18:30', k: 'PDF', c: 'red' },
        { n: '装備リスト.xlsx',             s: '18KB · 5/20 18:30',  k: 'XLSX', c: 'emerald' },
        { n: 'ルートマップ.gpx',            s: '45KB · 5/20 18:30',  k: 'GPX', c: 'blue' },
        { n: '緊急連絡先リスト.pdf',         s: '120KB · 5/19 22:10', k: 'PDF', c: 'red' },
      ].map((f, i) => {
        const map = { red: ['var(--red-soft)', 'var(--red-text)'], emerald: ['var(--emerald-soft)', 'var(--emerald-text)'], blue: ['var(--blue-soft)', 'var(--blue-text)'] };
        const [bg, fg] = map[f.c];
        return (
          <div key={i} style={{
            background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
            padding: '12px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 36, height: 42, borderRadius: 5, background: bg, color: fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.k}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.n}
                {f.latest && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--accent)', color: 'var(--on-accent)' }}>最新版</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{f.s}</div>
            </div>
            <Icon name="more" size={18} color="var(--text-3)"/>
          </div>
        );
      })}
    </div>
    <button style={{
      position: 'absolute', right: 16, bottom: 96, width: 52, height: 52, borderRadius: '50%',
      background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 24px rgba(16,185,129,0.4)', cursor: 'pointer', zIndex: 6,
    }}><Icon name="plus" size={22} strokeWidth={2.4}/></button>
    <MTabBar active="home" items={TAB_HOME}/>
  </MobileShell>
);

// ─── Screen: Calendar (week-ish) ─────────────────────────────────
const MCalendar = () => (
  <MobileShell>
    <MobileTopBar
      left={<Icon name="list" size={22} color="var(--text)"/>}
      center="カレンダー"
      right={<button style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent)', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily:'inherit' }}>今日</button>}
    />
    <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name="chevLeft" size={18} color="var(--text-2)"/>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>6月 2024 <Icon name="chevDown" size={11}/></span>
    </div>
    {/* Week strip */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '4px 12px 6px', gap: 4 }}>
      {['日','月','火','水','木','金','土'].map((d, i) => (
        <div key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: i===0 ? 'var(--red)' : i===6 ? 'var(--blue)' : 'var(--text-3)' }}>{d}</div>
      ))}
      {[9, 10, 11, 12, 13, 14, 15].map((d, i) => (
        <div key={d} style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13.5, fontWeight: d === 12 ? 700 : 500,
            background: d === 12 ? 'var(--accent)' : 'transparent',
            color: d === 12 ? 'var(--on-accent)' : i===0 ? 'var(--red)' : i===6 ? 'var(--blue)' : 'var(--text-2)',
          }}>{d}</span>
        </div>
      ))}
    </div>
    {/* Agenda */}
    <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 100px' }}>
      {[
        { d: '9日', day: '日', items: [{ n: '北アルプス縦走計画', c: 'plan' }] },
        { d: '10日', day: '月', items: [{ n: '沢登り練習会', c: 'plan' }] },
        { d: '11日', day: '火', items: [{ n: 'クライミング講習会', c: 'review' }] },
        { d: '12日', day: '水', items: [], today: true },
        { d: '13日', day: '木', items: [{ n: '雪山訓練', c: 'retro' }] },
        { d: '14日', day: '金', items: [] },
        { d: '15日', day: '土', items: [{ n: '夏山合宿計画', c: 'wait' }] },
      ].map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: row.today ? 'var(--accent)' : 'var(--text)', lineHeight: 1 }}>{row.d.replace('日','')}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{row.day}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {row.items.length === 0 && <div style={{ height: 28, borderRadius: 6, background: 'transparent' }}/>}
            {row.items.map((it, j) => {
              const cfg = STATUS_COL[it.c];
              return (
                <div key={j} style={{
                  height: 28, borderRadius: 6, background: cfg.bg, color: cfg.text,
                  borderLeft: `3px solid ${cfg.bar}`, padding: '0 10px',
                  fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
                }}>{it.n}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    <button style={{
      position: 'absolute', right: 16, bottom: 96, width: 52, height: 52, borderRadius: '50%',
      background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 24px rgba(16,185,129,0.4)', zIndex: 6,
    }}><Icon name="plus" size={22} strokeWidth={2.4}/></button>
    <MTabBar active="projects" items={TAB_HOME}/>
  </MobileShell>
);

// ─── Screen: Kanban (horizontal swipe) ───────────────────────────
const MKanban = () => (
  <MobileShell>
    <MobileTopBar
      left={<Icon name="chevLeft" size={22} color="var(--text)"/>}
      center="カンバン"
      right={<><Icon name="filter" size={20} color="var(--text)"/></>}
    />
    <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '8px 12px 100px', display: 'flex', gap: 10, scrollSnapType: 'x mandatory' }}>
      {['plan', 'review'].map((c, ci) => {
        const cfg = STATUS_COL[c];
        const items = PROJECTS.filter(p => p.status === c);
        return (
          <div key={c} style={{
            width: 'calc(100% - 60px)', flexShrink: 0,
            background: cfg.bg, borderRadius: 12, padding: 10,
            scrollSnapAlign: 'start',
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{ padding: '4px 6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.text }}>{STATUS[c].label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: cfg.text, opacity: 0.6 }}>{items.length}</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(p => (
                <div key={p.id} style={{
                  background: 'var(--card)', borderRadius: 10, padding: 10,
                  borderLeft: `3px solid ${cfg.bar}`, border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>{p.dates}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 3))} size={18}/>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-3)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon name="chat" size={11}/>{p.unread || 2}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon name="paperclip" size={11}/>{p.unread || 3}</span>
                    </div>
                  </div>
                </div>
              ))}
              <button style={{ padding: '8px 6px', border: 'none', background: 'transparent', color: cfg.text, fontSize: 12, fontWeight: 600, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: 0.85 }}>
                <Icon name="plus" size={13}/> カードを追加
              </button>
            </div>
          </div>
        );
      })}
    </div>
    <MTabBar active="projects" items={TAB_HOME}/>
  </MobileShell>
);

// ─── Screen: Tasks ───────────────────────────────────────────────
const MTasks = () => {
  const open = [
    { d: '6/5',  t: '計画書を最新版に更新する', p: '高', a: '山田' },
    { d: '6/6',  t: '装備リストを確定する',     p: '中', a: '佐藤' },
    { d: '6/8',  t: 'テント場を予約する',       p: '中', a: '鈴木' },
    { d: '6/10', t: '予備日程を検討する',       p: '低', a: '田中' },
  ];
  const done = [
    { d: '5/18', t: 'ルート案を作成する',     a: '山田' },
    { d: '5/18', t: 'メンバーの参加可否確認', a: '佐藤' },
  ];
  const pmap = { 高: 'var(--red)', 中: 'var(--amber)', 低: 'var(--text-3)' };
  return (
    <MobileShell>
      <MobileTopBar
        left={<Icon name="list" size={22} color="var(--text)"/>}
        center="タスク"
        right={<Icon name="more" size={22} color="var(--text)"/>}
      />
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {[['すべて', true], ['自分のタスク', false], ['完了', false]].map(([l, on], i) => (
          <button key={i} style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
            color: on ? 'var(--accent)' : 'var(--text-3)',
            fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit',
            borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 100px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6 }}>未完了</div>
        {open.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--border-2)' }}/>
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)' }}>{t.t}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pmap[t.p], padding: '2px 7px', borderRadius: 5, background: 'var(--card)' }}>{t.p}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', minWidth: 30 }}>{t.d}</span>
            <Avatar name={t.a} size={22}/>
          </div>
        ))}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', margin: '14px 0 6px' }}>完了</div>
        {done.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
              <Icon name="check" size={12} strokeWidth={3}/>
            </div>
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-3)', textDecoration: 'line-through' }}>{t.t}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', minWidth: 30 }}>{t.d}</span>
            <Avatar name={t.a} size={22}/>
          </div>
        ))}
      </div>
      <button style={{
        position: 'absolute', right: 16, bottom: 96, width: 52, height: 52, borderRadius: '50%',
        background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(16,185,129,0.4)', zIndex: 6,
      }}><Icon name="plus" size={22} strokeWidth={2.4}/></button>
      <MTabBar active="tasks" items={TAB_HOME}/>
    </MobileShell>
  );
};

// ─── Screen: Members ─────────────────────────────────────────────
const MMembers = () => {
  const ROLES = [
    { n: '山田 太郎', r: 'リーダー' },
    { n: '佐藤 花子', r: 'サブリーダー' },
    { n: '鈴木 健',   r: 'メンバー' },
    { n: '田中 陽子', r: 'メンバー' },
    { n: '伊藤 翔',   r: 'メンバー' },
    { n: '高橋 美咲', r: 'メンバー' },
    { n: '中村 拓也', r: 'メンバー' },
    { n: '小林 大地', r: 'メンバー' },
  ];
  return (
    <MobileShell>
      <MobileTopBar
        left={<Icon name="chevLeft" size={22} color="var(--text)"/>}
        center="メンバー"
        right={<Icon name="more" size={22} color="var(--text)"/>}
      />
      <div style={{ padding: '0 16px', display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', borderBottom: '2px solid var(--accent)', marginBottom: -1 }}>参加中 (8)</button>
        <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit' }}>未確定 (2)</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 110px' }}>
        {ROLES.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--divider)' }}>
            <Avatar name={m.n} size={36}/>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{m.n}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{m.r}</span>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 96 }}>
        <button style={{
          width: '100%', padding: '14px', borderRadius: 999,
          border: '2px solid var(--accent)', background: 'transparent',
          color: 'var(--accent)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        }}>メンバーを招待</button>
      </div>
      <MTabBar active="home" items={TAB_HOME}/>
    </MobileShell>
  );
};

// ─── Screen: New project (modal-like form) ───────────────────────
const MNewProject = () => (
  <MobileShell>
    <div style={{ padding: '52px 16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--rose)', fontSize: 14, fontWeight: 500 }}>キャンセル</span>
      <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>新規プロジェクトを作成</span>
      <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}>保存</span>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 100px' }}>
      <div style={{
        height: 140, borderRadius: 12, border: '2px dashed var(--border-2)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        color: 'var(--text-3)', marginBottom: 18,
      }}>
        <Icon name="image" size={28}/>
        <span style={{ fontSize: 12.5 }}>写真を追加</span>
      </div>
      <Label l="プロジェクト名"/>
      <Input v="例: 北アルプス縦走計画"/>
      <Label l="日程"/>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input v="開始日" half/>
        <span style={{ alignSelf: 'center', color: 'var(--text-3)' }}>~</span>
        <Input v="終了日" half/>
      </div>
      <Label l="ステータス"/>
      <div style={{ marginBottom: 14 }}>
        <button style={{
          padding: '8px 14px', borderRadius: 999, border: 'none',
          background: 'var(--blue-soft)', color: 'var(--blue-text)',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)' }}/>
          計画中 <Icon name="chevDown" size={12}/>
        </button>
      </div>
      <Label l="メンバーを追加" right={<Icon name="plus" size={18} color="var(--accent)"/>}/>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {MEMBERS.slice(0, 4).map(m => <Avatar key={m} name={m} size={36}/>)}
      </div>
      <Label l="メモ"/>
      <div style={{
        padding: '12px 14px', borderRadius: 10, background: 'var(--card)',
        border: '1px solid var(--border)', minHeight: 80, color: 'var(--text-4)', fontSize: 13,
      }}>メモを入力（任意）</div>
    </div>
  </MobileShell>
);
const Label = ({ l, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, padding: '0 2px' }}>
    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.02em', flex: 1 }}>{l}</span>
    {right}
  </div>
);
const Input = ({ v, half }) => (
  <div style={{
    padding: '12px 14px', borderRadius: 10, background: 'var(--card)',
    border: '1px solid var(--border)', color: 'var(--text-4)', fontSize: 13,
    marginBottom: half ? 0 : 14, flex: half ? 1 : 'initial',
  }}>{v}</div>
);

// ─── Screen: Gallery (Instagram-style 3-col grid) ────────────────
const MGallery = () => (
  <MobileShell>
    <MobileTopBar
      left={<Icon name="chevLeft" size={22} color="var(--text)"/>}
      center="ギャラリー"
      right={<Icon name="more" size={22} color="var(--text)"/>}
    />
    <div style={{ padding: '0 12px', display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto' }}>
      {['すべて', '北アルプス', '夏山合宿', 'クライミング', '雪山訓練'].map((t, i) => (
        <button key={i} style={{
          flexShrink: 0, padding: '5px 12px', borderRadius: 999,
          background: i === 0 ? 'var(--accent)' : 'var(--card)',
          color: i === 0 ? 'var(--on-accent)' : 'var(--text-2)',
          border: i === 0 ? 'none' : '1px solid var(--border)',
          fontSize: 12, fontWeight: i === 0 ? 700 : 500, fontFamily: 'inherit',
        }}>{t}</button>
      ))}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '0 2px 100px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
        {Array.from({ length: 27 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1/1', overflow: 'hidden', position: 'relative' }}>
            <MountainPhoto idx={i} height={130} flat/>
            {i % 5 === 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>
                <Icon name="image" size={13}/>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
    <MTabBar active="menu" items={TAB_HOME}/>
  </MobileShell>
);

// ─── Screen: AI Assistant (mobile) ───────────────────────────────
const MAI = () => (
  <MobileShell>
    <div style={{ padding: '52px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
      <Icon name="chevLeft" size={22} color="var(--text)"/>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        <Icon name="sparkles" size={13}/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>AIアシスタント</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>北アルプス縦走計画</div>
      </div>
      <Icon name="more" size={22} color="var(--text)"/>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <div style={{ maxWidth: '82%', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: '16px 16px 4px 16px', padding: '8px 12px', fontSize: 13, lineHeight: 1.5 }}>
          装備リストで足りないものを教えて
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          <Icon name="sparkles" size={13}/>
        </div>
        <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          装備リストを確認しました。<br/>
          <b style={{ color: 'var(--text)' }}>不足の可能性があるもの:</b>
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            <li>予備ガス缶（推奨 +2個）</li>
            <li>緊急用ツェルト</li>
            <li>予備食 1日分</li>
          </ul>
          詳細をチャットに展開しますか？
        </div>
      </div>
      <div style={{ marginBottom: 10, fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>参考</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['装備リスト.xlsx', '北アルプス縦走計画書_v2.pdf'].map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)' }}>
            <Icon name="file" size={13} color="var(--text-3)"/>
            <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 92 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
        {['チャットに展開', '別案を提案', '危険度を評価'].map((s, i) => (
          <button key={i} style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 999,
            background: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
          }}>{s}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 22, padding: '8px 8px 8px 14px' }}>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-4)' }}>AIに質問…</span>
        <Icon name="mic" size={18} color="var(--text-3)"/>
        <button style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="arrowUp" size={14}/>
        </button>
      </div>
    </div>
    <MTabBar active="menu" items={TAB_HOME}/>
  </MobileShell>
);

Object.assign(window, {
  MProjectList, MProjectChat, MFiles, MCalendar, MKanban, MTasks, MMembers, MNewProject, MGallery, MAI,
  MobileThemeCtx,
});
