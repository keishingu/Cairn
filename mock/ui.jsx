/* global React */
// ui.jsx — shared primitives: Icon, Avatar, StatusChip, Sidebar

// ─── Icons (Lucide-style, 1.6 stroke) ────────────────────────────
const Icon = ({ name, size = 18, color = 'currentColor', strokeWidth = 1.7, style }) => {
  const s = { width: size, height: size, color, ...style };
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: s,
  };
  const paths = {
    home:        <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>,
    calendar:    <><rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2.5v4M16 2.5v4"/></>,
    kanban:      <><rect x="3" y="3" width="6" height="14" rx="1.5"/><rect x="11" y="3" width="6" height="10" rx="1.5"/><rect x="19" y="3" width="2" height="18" rx="1" stroke="none" fill="currentColor" opacity="0"/><rect x="15" y="3" width="6" height="18" rx="1.5"/></>,
    check:       <><polyline points="20 6 9 17 4 12"/></>,
    chat:        <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></>,
    file:        <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></>,
    users:       <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    settings:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    sparkles:    <><path d="M12 3l1.7 4.5L18 9l-4.3 1.5L12 15l-1.7-4.5L6 9l4.3-1.5z"/><path d="M19 14l.8 2 2 .8-2 .8L19 19l-.8-2-2-.8 2-.8z"/><path d="M5 4l.6 1.5L7 6l-1.4.5L5 8l-.6-1.5L3 6l1.4-.5z"/></>,
    image:       <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5L5 21"/></>,
    inbox:       <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-6z"/></>,
    plus:        <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search:      <><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></>,
    bell:        <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
    chevDown:    <><polyline points="6 9 12 15 18 9"/></>,
    chevRight:   <><polyline points="9 6 15 12 9 18"/></>,
    chevLeft:    <><polyline points="15 6 9 12 15 18"/></>,
    close:       <><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></>,
    more:        <><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
    filter:      <><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5"/></>,
    paperclip:   <><path d="M21 11l-9.5 9.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3L15 7"/></>,
    smile:       <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
    send:        <><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    heart:       <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    pin:         <><path d="M12 17v5"/><path d="M9 11l-3 3h12l-3-3V3H9z"/></>,
    flag:        <><path d="M4 21V4h14l-3 5 3 5H4"/></>,
    arrowUp:     <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    mountain:    <><path d="M3 20l6-9 4 6 3-4 5 7z"/><circle cx="9" cy="6" r="1.5"/></>,
    folder:      <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
    download:    <><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></>,
    edit:        <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    grip:        <><circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/></>,
    arrowRight:  <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    star:        <><polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6"/></>,
    clock:       <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></>,
    play:        <><polygon points="6 4 20 12 6 20" fill="currentColor" stroke="none"/></>,
    archive:     <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="13" x2="14" y2="13"/></>,
    eye:         <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></>,
    mic:         <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 12a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/></>,
    moon:        <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    sun:         <><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></>,
    pdf:         <><path d="M7 3h7l4 4v14H7z" fill="currentColor" stroke="none" opacity=".0"/><path d="M7 3h7l4 4v14a0 0 0 0 1 0 0H7z"/><path d="M14 3v4h4"/></>,
    book:        <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></>,
    list:        <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></>,
    layers:      <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    map:         <><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/></>,
    tent:        <><path d="M3 20l9-15 9 15z"/><path d="M12 5v15"/><path d="M9 20l3-4 3 4"/></>,
    lock:        <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
    hash:        <><line x1="5" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="19" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
  };
  return <svg {...props}>{paths[name] || null}</svg>;
};

// ─── Avatar (initials with deterministic gradient) ───────────────
const AV_GRADS = [
  ['#34D399', '#10B981'],
  ['#60A5FA', '#3B82F6'],
  ['#F59E0B', '#F97316'],
  ['#F472B6', '#EC4899'],
  ['#A78BFA', '#7C3AED'],
  ['#FB7185', '#E11D48'],
  ['#22D3EE', '#0891B2'],
  ['#FBBF24', '#D97706'],
];
function hashName(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const Avatar = ({ name = '', size = 28, ring = false, style }) => {
  const initials = name ? name.replace(/\s/g, '').slice(0, 1).toUpperCase() : '?';
  const g = AV_GRADS[hashName(name) % AV_GRADS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
      color: '#fff', fontWeight: 600, fontSize: size * 0.42,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: ring ? '0 0 0 2px var(--card)' : 'none',
      flexShrink: 0,
      ...style,
    }}>{initials}</div>
  );
};

const AvatarStack = ({ names = [], size = 24, max = 4 }) => {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((n, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar name={n} size={size} ring />
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          marginLeft: -size * 0.32,
          width: size, height: size, borderRadius: '50%',
          background: 'var(--bg-elev)', color: 'var(--text-3)',
          fontSize: size * 0.38, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 2px var(--card)',
        }}>+{extra}</div>
      )}
    </div>
  );
};

// ─── Status chip ─────────────────────────────────────────────────
const STATUS = {
  plan:    { label: '計画中',   bg: 'var(--blue-soft)',    fg: 'var(--blue-text)',    dot: 'var(--blue)' },
  review:  { label: '審議中',   bg: 'var(--amber-soft)',   fg: 'var(--amber-text)',   dot: 'var(--amber)' },
  wait:    { label: '実施待ち', bg: 'var(--emerald-soft)', fg: 'var(--emerald-text)', dot: 'var(--emerald)' },
  doing:   { label: '実施中',   bg: 'var(--violet-soft)',  fg: 'var(--violet-text)',  dot: 'var(--violet)' },
  retro:   { label: '振り返り中', bg: 'var(--rose-soft)',  fg: 'var(--rose-text)',    dot: 'var(--rose)' },
  done:    { label: '完了',     bg: 'var(--bg-elev)',      fg: 'var(--text-3)',       dot: 'var(--text-4)' },
};
const StatusChip = ({ s, size = 11 }) => {
  const cfg = STATUS[s] || STATUS.plan;
  return (
    <span className="chip" style={{ background: cfg.bg, color: cfg.fg, fontSize: size }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot }}/>
      {cfg.label}
    </span>
  );
};

// ─── Sidebar (PC main nav) ───────────────────────────────────────
const SidebarItem = ({ icon, label, active, badge, onClick, indent }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: indent ? '7px 10px 7px 30px' : '8px 10px', borderRadius: 8, border: 'none',
    background: active ? 'var(--card-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontWeight: active ? 600 : 500, fontSize: indent ? 13 : 13.5,
    cursor: 'pointer', textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background .12s',
    position: 'relative',
  }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--card-2)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    {active && <span style={{ position:'absolute', left:-12, top:6, bottom:6, width:3, borderRadius:2, background:'var(--accent)' }}/>}
    {icon && <Icon name={icon} size={17} />}
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{
        background: 'var(--accent)', color: 'var(--on-accent)',
        fontSize: 10.5, fontWeight: 700, padding: '1px 6px',
        borderRadius: 999, minWidth: 18, textAlign: 'center',
      }}>{badge}</span>
    )}
  </button>
);

// Collapsible group — header acts like a regular nav item when collapsed and
// reads as a section title when expanded. The chevron rotates 90° to indicate
// state.
const SidebarGroup = ({ icon, label, page, setPage, items }) => {
  const isChildActive = items.some(it => it.id === page);
  const [open, setOpen] = React.useState(isChildActive);
  // Auto-expand if a child becomes active by another route.
  React.useEffect(() => { if (isChildActive) setOpen(true); }, [isChildActive]);
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '8px 10px', borderRadius: 8, border: 'none',
        background: 'transparent',
        color: isChildActive ? 'var(--text)' : 'var(--text-2)',
        fontWeight: isChildActive ? 600 : 500, fontSize: 13.5,
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--card-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon name={icon} size={17}/>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ display: 'inline-flex', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--text-4)' }}>
          <Icon name="chevRight" size={12}/>
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 6, paddingLeft: 8, borderLeft: '1px solid var(--divider)' }}>
          {items.map(it => (
            <SidebarItem key={it.id} icon={it.icon} label={it.label} badge={it.badge}
              active={page === it.id} onClick={() => setPage(it.id)} indent/>
          ))}
        </div>
      )}
    </>
  );
};

const Sidebar = ({ page, setPage }) => {
  const projectChildren = [
    { id: 'projects', icon: 'list',     label: '一覧' },
    { id: 'calendar', icon: 'calendar', label: 'カレンダー' },
    { id: 'kanban',   icon: 'kanban',   label: 'カンバン' },
  ];
  return (
    <aside style={{
      width: 236, flexShrink: 0,
      background: 'var(--card)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Workspace header */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #10B981, #0891B2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
          }}>
            <Icon name="mountain" size={18} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>山岳部</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.2 }}>東京工科大学 · Pro</div>
          </div>
          <Icon name="chevDown" size={14} color="var(--text-3)" />
        </div>
        <button style={{
          marginTop: 12, width: '100%', height: 32,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 10px', borderRadius: 7,
          background: 'var(--card-2)', border: '1px solid var(--border)',
          color: 'var(--text-3)', fontSize: 12.5, fontFamily: 'inherit',
          cursor: 'pointer',
        }}>
          <Icon name="search" size={14} />
          <span style={{ flex: 1, textAlign: 'left' }}>検索</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflow: 'auto', padding: '12px 12px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '4px 10px 6px', textTransform: 'uppercase' }}>ワークスペース</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarItem icon="home" label="ダッシュボード" active={page === 'dashboard'} onClick={() => setPage('dashboard')}/>
          <SidebarGroup icon="folder" label="プロジェクト" page={page} setPage={setPage} items={projectChildren}/>
          <SidebarItem icon="check" label="マイタスク" badge={4} active={page === 'tasks'} onClick={() => setPage('tasks')}/>
          <SidebarItem icon="chat"  label="チャット一覧" badge={12} active={page === 'chats'} onClick={() => setPage('chats')}/>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '14px 10px 6px', textTransform: 'uppercase' }}>ライブラリ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarItem icon="file"     label="ファイル"     active={page === 'files'}   onClick={() => setPage('files')}/>
          <SidebarItem icon="image"    label="ギャラリー"   active={page === 'gallery'} onClick={() => setPage('gallery')}/>
          <SidebarItem icon="sparkles" label="AIアシスタント" active={page === 'ai'}    onClick={() => setPage('ai')}/>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '14px 10px 6px', textTransform: 'uppercase' }}>管理</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarItem icon="users"    label="メンバー"  active={page === 'members'}  onClick={() => setPage('members')}/>
          <SidebarItem icon="settings" label="設定"     active={page === 'settings'} onClick={() => setPage('settings')}/>
        </div>

        {/* Project pins */}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '18px 10px 8px', textTransform: 'uppercase', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>ピン留めプロジェクト</span>
          <Icon name="plus" size={12} color="var(--text-4)"/>
        </div>
        {[
          { name: '北アルプス縦走計画', dot: 'var(--blue)' },
          { name: '夏山合宿計画', dot: 'var(--emerald)' },
          { name: 'クライミング講習会', dot: 'var(--amber)' },
          { name: '雪山訓練', dot: 'var(--rose)' },
        ].map((p, i) => (
          <button key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 10px', borderRadius: 7, border: 'none', background: 'transparent',
            color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
            fontFamily: 'inherit',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.dot, flexShrink: 0 }}/>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
          </button>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--divider)', display:'flex', alignItems:'center', gap: 10 }}>
        <Avatar name="山田 太郎" size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight:1.2 }}>山田 太郎</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight:1.3 }}>部長 · オンライン</div>
        </div>
        <button style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-3)', padding: 4, borderRadius:6 }}><Icon name="more" size={16}/></button>
      </div>
    </aside>
  );
};

// ─── TopBar (shared across pages) ────────────────────────────────
const TopBar = ({ title, subtitle, children, onBell }) => (
  <header style={{
    height: 56, flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '0 24px', borderBottom: '1px solid var(--border)',
    background: 'var(--card)',
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>{title}</h1>
        {subtitle && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{subtitle}</span>}
      </div>
    </div>
    {children}
    <button onClick={onBell} className="btn btn-ghost" style={{ width: 34, padding: 0, justifyContent:'center', position: 'relative' }}>
      <Icon name="bell" size={16}/>
      <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--card)' }}/>
    </button>
    <button className="btn btn-ghost" style={{ width: 34, padding: 0, justifyContent:'center' }}><Icon name="inbox" size={16}/></button>
  </header>
);

Object.assign(window, { Icon, Avatar, AvatarStack, StatusChip, STATUS, Sidebar, TopBar });
