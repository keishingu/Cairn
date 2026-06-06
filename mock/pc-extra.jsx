/* global React, Icon, Avatar, AvatarStack, StatusChip, MEMBERS, MountainPhoto */
// pc-extra.jsx — Notifications slide-in + Full-page Chat (Slack風)

// ─── Notifications: slide-in panel on the right ───────────────────
const PageNotifications = ({ onClose }) => {
  const [filter, setFilter] = React.useState('all');
  const items = [
    { k: 'mention', icon: 'chat',  who: '佐藤 花子', t: '@山田 太郎 1日目のテント場について意見ある？', p: '北アルプス縦走計画', when: '5分前', unread: true },
    { k: 'file',    icon: 'file',  who: '田中 陽子', t: '北アルプス縦走計画書_v2.pdf をアップロードしました', p: '北アルプス縦走計画', when: '20分前', unread: true },
    { k: 'status',  icon: 'flag',  who: '鈴木 健',   t: 'クライミング講習会 を 審議中 に変更', p: 'クライミング講習会', when: '1時間前', unread: true },
    { k: 'ai',      icon: 'sparkles', who: 'AIアシスタント', t: '装備リストの不足（予備ガス缶+2個）を検出しました', p: '北アルプス縦走計画', when: '2時間前', unread: true, ai: true },
    { k: 'task',    icon: 'check', who: '伊藤 翔',   t: 'タスク「ルート案を作成する」を完了しました', p: '北アルプス縦走計画', when: '3時間前' },
    { k: 'invite',  icon: 'users', who: '高橋 美咲', t: '雪山訓練 に招待されました', p: '雪山訓練', when: '昨日' },
    { k: 'reaction',icon: 'heart', who: '中村 拓也', t: 'あなたのメッセージに 👍 リアクション', p: '夏山合宿計画', when: '昨日' },
    { k: 'file',    icon: 'file',  who: '小林 大地', t: 'ルートマップ.gpx を更新しました', p: '雪山訓練', when: '昨日' },
  ];
  const kindMap = {
    mention:  { c: 'var(--blue)',    bg: 'var(--blue-soft)' },
    file:     { c: 'var(--violet)',  bg: 'var(--violet-soft)' },
    status:   { c: 'var(--amber)',   bg: 'var(--amber-soft)' },
    ai:       { c: 'var(--accent)',  bg: 'var(--accent-soft)' },
    task:     { c: 'var(--emerald)', bg: 'var(--emerald-soft)' },
    invite:   { c: 'var(--rose)',    bg: 'var(--rose-soft)' },
    reaction: { c: 'var(--rose)',    bg: 'var(--rose-soft)' },
  };

  const filters = [
    { id: 'all',     l: 'すべて' },
    { id: 'mention', l: '@メンション' },
    { id: 'ai',      l: 'AI' },
    { id: 'unread',  l: '未読' },
  ];

  const filtered = items.filter(it =>
    filter === 'all' ? true :
    filter === 'unread' ? it.unread :
    filter === 'mention' ? it.k === 'mention' :
    filter === 'ai' ? it.k === 'ai' : true
  );
  const unreadCount = items.filter(i => i.unread).length;

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'var(--overlay)', zIndex: 30,
        animation: 'notifFadeIn .15s ease-out',
      }}/>
      {/* Panel */}
      <aside style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 400,
        background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)', zIndex: 31,
        display: 'flex', flexDirection: 'column',
        animation: 'notifSlideIn .2s cubic-bezier(.2,.7,.3,1)',
      }}>
        <style>{`
          @keyframes notifSlideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes notifFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              通知
              {unreadCount > 0 && (
                <span style={{
                  background: 'var(--accent)', color: 'var(--on-accent)',
                  fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                }}>{unreadCount}</span>
              )}
            </h2>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12, padding: '0 8px' }}>
              <Icon name="check" size={12}/> すべて既読
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={15}/>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '5px 12px', borderRadius: 999, border: 'none',
                background: filter === f.id ? 'var(--card-hover)' : 'transparent',
                color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: 12, fontWeight: filter === f.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{f.l}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              該当する通知はありません
            </div>
          ) : filtered.map((it, i) => {
            const cfg = kindMap[it.k];
            return (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '12px 18px',
                borderBottom: '1px solid var(--divider)',
                background: it.unread ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer', position: 'relative',
              }}
                onMouseEnter={e => { if (!it.unread) e.currentTarget.style.background = 'var(--card-2)'; }}
                onMouseLeave={e => { if (!it.unread) e.currentTarget.style.background = 'transparent'; }}
              >
                {it.unread && <span style={{ position: 'absolute', top: 18, left: 7, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}/>}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, color: cfg.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={it.icon} size={15}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{it.who}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}>· {it.when}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 4 }}>{it.t}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="folder" size={10.5}/> {it.p}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};

// ─── Full-page Chat (Slack風) ─────────────────────────────────────
const CHANNELS = [
  { id: 'c1', name: '北アルプス縦走計画', unread: 5, project: true, online: 6 },
  { id: 'c2', name: '夏山合宿計画',     unread: 7, project: true, online: 4 },
  { id: 'c3', name: 'クライミング講習会', unread: 2, project: true, online: 2 },
  { id: 'c4', name: '雪山訓練',         unread: 0, project: true, online: 3 },
  { id: 'c5', name: '春山合宿',         unread: 0, project: true, online: 1 },
];
const GENERAL_CHANNELS = [
  { id: 'g1', name: '雑談',        unread: 3, online: 12 },
  { id: 'g2', name: '連絡事項',    unread: 1, online: 8 },
  { id: 'g3', name: 'OB会',        unread: 0, online: 5 },
  { id: 'g4', name: 'コーチ専用',  unread: 2, online: 3, private: true },
  { id: 'g5', name: '部長会',      unread: 0, online: 4, private: true },
];
const DMS = [
  { id: 'd1', name: '佐藤 花子', online: true,  unread: 0 },
  { id: 'd2', name: '鈴木 健',   online: true,  unread: 2 },
  { id: 'd3', name: '田中 陽子', online: false, unread: 0 },
  { id: 'd4', name: '伊藤 翔',   online: false, unread: 0 },
];

const PageChat = () => {
  const [channel, setChannel] = React.useState('c1');
  const [msgs, setMsgs] = React.useState([
    { n: '山田 太郎', t: '5/20 18:30', x: '北アルプス縦走の計画書をアップしました。\n日程やルート、装備リストを確認して、意見をお願いします！',
      f: { name: '北アルプス縦走計画書_v1.pdf', size: '2.4MB' }, r: [{ e: '👍', c: 3, me: true }] },
    { n: '佐藤 花子', t: '5/20 19:15', x: '日程はこのままで大丈夫そうです！\n1日目のテント場はもう少し標高を下げた方が安全かも？', r: [{ e: '👍', c: 2 }] },
    { n: '鈴木 健', t: '5/20 19:45',   x: '装備リスト確認しました。ガス缶は予備も含めてもう1個ずつ追加した方が良いかと思います。', r: [{ e: '👍', c: 1 }] },
    { n: '山田 太郎', t: '5/20 20:10', x: 'ありがとうございます！\n計画書を更新して、明日のミーティングで審議に回します。' },
    { divider: '5月21日 (火)' },
    { n: '田中 陽子', t: '5/21 08:30', x: '最新版の計画書をアップしました！',
      f: { name: '北アルプス縦走計画書_v2.pdf', size: '2.7MB' }, r: [{ e: '👍', c: 2 }, { e: '🎉', c: 1 }] },
    { n: 'AIアシスタント', t: '5/21 08:32', ai: true,
      x: '計画書 v2 を確認しました。v1 から変更点: テント場の位置を 200m 下げ、ガス缶を +2 個追加。安全性が向上しています。' },
    { n: '佐藤 花子', t: '5/21 09:02', x: 'AIの分析ありがとうございます！この方針で進めましょう。', r: [{ e: '🙌', c: 3 }] },
  ]);
  const [draft, setDraft] = React.useState('');
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const d = new Date();
    setMsgs(prev => [...prev, { n: '山田 太郎', t: `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, x: text }]);
    setDraft('');
  };

  const cur =
    CHANNELS.find(c => c.id === channel) ||
    GENERAL_CHANNELS.find(c => c.id === channel) ||
    CHANNELS[0];
  const isProject = !!cur.project;
  const isPrivate = !!cur.private;

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Channel sidebar */}
      <aside style={{ width: 240, background: 'var(--card-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>チャット</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px' }}>
          <ChatSidebarSection title="プロジェクト">
            {CHANNELS.map(c => (
              <ChatSidebarItem key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}
                prefix="#" label={c.name} badge={c.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="チャンネル">
            {GENERAL_CHANNELS.map(c => (
              <ChatSidebarItem key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}
                prefix={c.private ? 'lock' : '#'} label={c.name} badge={c.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="ダイレクトメッセージ">
            {DMS.map(d => (
              <ChatSidebarItem key={d.id} active={channel === d.id} onClick={() => setChannel(d.id)}
                avatar={d.name} dot={d.online ? 'var(--accent)' : 'var(--text-4)'}
                label={d.name} badge={d.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="アプリ">
            <ChatSidebarItem prefix="✨" label="AIアシスタント"/>
          </ChatSidebarSection>
        </div>
      </aside>

      {/* Main thread */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {isPrivate ? <Icon name="lock" size={13} color="var(--text-3)"/> : <span style={{ color: 'var(--text-3)' }}>#</span>}
                {cur.name}
              </h2>
              {isProject && <StatusChip s="plan"/>}
              {isPrivate && (
                <span className="chip" style={{ background: 'var(--amber-soft)', color: 'var(--amber-text)' }}>
                  <Icon name="lock" size={9}/> プライベート
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {isProject ? `8人参加 · ${cur.online}人オンライン` :
               isPrivate ? `${cur.online}人参加（招待制）` :
               `${cur.online}人参加 · ${cur.online}人オンライン`}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AvatarStack names={MEMBERS} size={26} max={5}/>
            <button className="btn"><Icon name="search" size={13}/></button>
            <button className="btn"><Icon name="bell" size={13}/></button>
            <button className="btn"><Icon name="more" size={14}/></button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
          {msgs.map((m, i) => m.divider ? (
            <div key={i} style={{ padding: '14px 24px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }}/>
              <span style={{ fontSize: 11.5, color: 'var(--text-4)', fontWeight: 600, padding: '2px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 999 }}>{m.divider}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }}/>
            </div>
          ) : (
            <FullChatMessage key={i} m={m}/>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '8px 24px 18px', background: 'var(--bg)' }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 12,
            boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--divider)' }}>
              {[
                { i: 'paperclip', l: '添付' },
                { i: 'image', l: '画像' },
                { i: 'sparkles', l: '@AI', accent: true },
                { i: 'smile', l: '絵文字' },
              ].map((b, j) => (
                <button key={j} style={{
                  border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5,
                  color: b.accent ? 'var(--accent)' : 'var(--text-3)',
                  fontSize: 11.5, fontWeight: b.accent ? 600 : 500,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit',
                }}><Icon name={b.i} size={13}/> {b.l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px 12px' }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`${isPrivate ? '🔒' : '#'} ${cur.name} にメッセージ送信`}
                rows={1}
                style={{
                  flex: 1, border: 'none', background: 'transparent', resize: 'none',
                  fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                  lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 160,
                }}/>
              <button onClick={send} style={{
                width: 30, height: 30, borderRadius: 8, border: 'none',
                background: draft.trim() ? 'var(--accent)' : 'var(--border-2)',
                color: draft.trim() ? 'var(--on-accent)' : 'var(--text-4)',
                cursor: draft.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .12s',
              }}><Icon name="send" size={13}/></button>
            </div>
          </div>
        </div>
      </main>

      {/* Right panel: project info (project channels) or channel about (general) */}
      <aside style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
            {isProject ? 'このプロジェクトについて' : 'このチャンネルについて'}
          </h3>
        </div>
        {isProject ? (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
            <MountainPhoto idx={0} height={120} flat radius={8}/>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{cur.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>6/12 (水) ~ 6/16 (日) · 4泊5日</div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {isPrivate ? <Icon name="lock" size={14} color="var(--amber-text)"/> : <Icon name="hash" size={14} color="var(--text-3)"/>}
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{cur.name}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {cur.id === 'g1' && '雑談・休憩用のオープンチャンネル。'}
              {cur.id === 'g2' && '部活全体への連絡事項を流すチャンネル。'}
              {cur.id === 'g3' && 'OB・OG向けの交流チャンネル。'}
              {cur.id === 'g4' && '顧問・コーチ陣のみが閲覧できる招待制チャンネル。'}
              {cur.id === 'g5' && '部長会メンバー限定のチャンネル。'}
            </p>
            {isPrivate && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--amber-soft)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="lock" size={12} color="var(--amber-text)"/>
                <span style={{ fontSize: 11.5, color: 'var(--amber-text)', fontWeight: 600 }}>招待されたメンバーのみが閲覧できます</span>
              </div>
            )}
          </div>
        )}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>ピン留め</div>
          {isProject ? [
            { n: '北アルプス縦走計画書_v2.pdf', s: 'PDF · 2.7MB' },
            { n: 'ルートマップ.gpx',          s: 'GPX · 45KB' },
          ].map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <Icon name="pin" size={12} color="var(--accent)"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.n}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{p.s}</div>
              </div>
            </div>
          )) : <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>ピン留めはまだありません</div>}
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>メンバー ({cur.online}/{isProject ? 8 : cur.online} オンライン)</div>
          {MEMBERS.slice(0, Math.min(6, cur.online + 2)).map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={m} size={24}/>
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < cur.online ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

const ChatSidebarSection = ({ title, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      <Icon name="plus" size={11} color="var(--text-4)"/>
    </div>
    <div>{children}</div>
  </div>
);

const ChatSidebarItem = ({ active, onClick, prefix, avatar, dot, label, badge }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 10px', borderRadius: 6, border: 'none',
    background: active ? 'var(--card-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontSize: 13, fontWeight: badge && badge > 0 ? 600 : 500,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--card)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    {prefix === 'lock' ? (
      <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: 'var(--text-3)' }}>
        <Icon name="lock" size={12}/>
      </span>
    ) : prefix ? (
      <span style={{ fontSize: 13, color: 'var(--text-3)', width: 14, textAlign: 'center' }}>{prefix}</span>
    ) : null}
    {avatar && (
      <div style={{ position: 'relative' }}>
        <Avatar name={avatar} size={18}/>
        {dot && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 6, height: 6, borderRadius: '50%', background: dot, border: '2px solid var(--card-2)' }}/>}
      </div>
    )}
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {badge > 0 && (
      <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, minWidth: 18, textAlign: 'center' }}>{badge}</span>
    )}
  </button>
);

const FullChatMessage = ({ m }) => (
  <div style={{ display: 'flex', gap: 12, padding: '6px 24px', alignItems: 'flex-start' }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--card-2)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
  >
    {m.ai ? (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
        <Icon name="sparkles" size={18}/>
      </div>
    ) : (
      <Avatar name={m.n} size={36}/>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{m.n}</span>
        {m.ai && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>APP</span>}
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{m.t}</span>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{m.x}</div>
      {m.f && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 8,
          background: 'var(--card-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
        }}>
          <div style={{ width: 34, height: 38, borderRadius: 4, background: 'var(--red-soft)', color: 'var(--red-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>PDF</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.f.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>PDF · {m.f.size}</div>
          </div>
          <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 6 }}><Icon name="download" size={14}/></button>
        </div>
      )}
      {m.r && m.r.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
          {m.r.map((r, i) => (
            <button key={i} style={{
              height: 24, padding: '0 8px', borderRadius: 12,
              background: r.me ? 'var(--accent-soft)' : 'var(--card-2)',
              border: `1px solid ${r.me ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 11.5, fontWeight: 600,
              color: r.me ? 'var(--accent-text)' : 'var(--text-2)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{r.e} {r.c}</button>
          ))}
          <button style={{ height: 24, width: 24, borderRadius: 12, background: 'transparent', border: '1px dashed var(--border-2)', color: 'var(--text-4)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="smile" size={12}/>
          </button>
        </div>
      )}
    </div>
  </div>
);

Object.assign(window, { PageNotifications, PageChat });
