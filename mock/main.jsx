/* global React, ReactDOM,
   Sidebar, TopBar, Icon, Avatar, StatusChip,
   PageDashboard, PageProjects, PageCalendar, PageKanban, PageGallery, PageAI, PageSettings, PageChat, PageNotifications,
   ProjectPanel,
   IOSDevice,
   MProjectList, MProjectChat, MFiles, MCalendar, MKanban, MTasks, MMembers, MNewProject, MGallery, MAI,
   MobileThemeCtx,
   DesignCanvas, DCSection, DCArtboard,
   TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakColor, TweakToggle, TweakSelect */
// main.jsx — top-level: PC interactive prototype + mobile artboards + Tweaks

// ─── PC App (interactive) ─────────────────────────────────────────
const PCApp = ({ theme }) => {
  const [page, setPage] = React.useState('projects');
  const [panel, setPanel] = React.useState(false); // project chat slide-in
  const [notifOpen, setNotifOpen] = React.useState(false);
  const openPanel = () => setPanel(true);

  // When switching pages, close any side panel (they're page-local).
  const onSetPage = (p) => { setPage(p); setPanel(false); setNotifOpen(false); };

  const pageTitle = {
    dashboard: 'ダッシュボード',
    projects:  'プロジェクト',
    calendar:  'カレンダー',
    kanban:    'カンバン',
    tasks:     'マイタスク',
    chats:     'チャット',
    files:     'ファイル',
    gallery:   'ギャラリー',
    ai:        'AIアシスタント',
    members:   'メンバー',
    settings:  '設定',
  }[page];

  // Full-bleed pages opt out of the top bar entirely (they have custom chrome).
  const noTopBar = ['ai', 'settings', 'gallery', 'chats'].includes(page);

  return (
    <div className="app" data-theme={theme} style={{
      width: '100%', height: '100%', display: 'flex',
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <Sidebar page={page} setPage={onSetPage}/>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
        {!noTopBar && (
          <TopBar title={pageTitle} subtitle={
            page === 'dashboard' ? '2024 Q2' :
            page === 'projects'  ? `${8} 件 · 進行中 ${7}` :
            page === 'kanban'    ? '8 件 / 5 ステージ'
            : null
          } onBell={() => setNotifOpen(true)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 32, width: 280 }}>
              <Icon name="search" size={14} color="var(--text-3)"/>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-4)' }}>プロジェクト・人・ファイルを検索</span>
              <span className="kbd">⌘K</span>
            </div>
          </TopBar>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
            {page === 'dashboard' && <PageDashboard openPanel={openPanel}/>}
            {page === 'projects' && <PageProjects openPanel={openPanel}/>}
            {page === 'calendar' && <PageCalendar openPanel={openPanel}/>}
            {page === 'kanban'   && <PageKanban   openPanel={openPanel}/>}
            {page === 'gallery'  && <PageGallery/>}
            {page === 'ai'       && <PageAI/>}
            {page === 'settings' && <PageSettings/>}
            {page === 'chats'    && <PageChat/>}
            {page === 'tasks'    && <PlaceholderPage name="マイタスク" icon="check"/>}
            {page === 'files'    && <PlaceholderPage name="ファイル"   icon="file"/>}
            {page === 'members'  && <PlaceholderPage name="メンバー"   icon="users"/>}
          </div>
          {panel && <ProjectPanel onClose={() => setPanel(false)}/>}
          {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)}/>}
        </div>
      </main>
    </div>
  );
};

const PlaceholderPage = ({ name, icon }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
    <div style={{ maxWidth: 360, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Icon name={icon} size={26}/>
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>{name}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
        このセクションはサイドバーから他のページへ移動できることを示すプレースホルダーです。実装時にはここに専用のビューが表示されます。
      </p>
    </div>
  </div>
);

// ─── Mobile artboard helper ──────────────────────────────────────
const Phone = ({ children, theme, w = 390, h = 800 }) => (
  <IOSDevice width={w} height={h} dark={theme === 'dark'}>
    <MobileThemeCtx.Provider value={theme}>
      {children}
    </MobileThemeCtx.Provider>
  </IOSDevice>
);

// ─── Root with Tweaks ────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "pcTheme": "light",
  "mobileTheme": "dark",
  "accent": "#10B981",
  "showMobile": true
}/*EDITMODE-END*/;

const ACCENT_PRESETS = {
  '#10B981': { hover: '#059669', soft: '#ECFDF5', soft2: '#D1FAE5', text: '#047857' }, // emerald
  '#3B82F6': { hover: '#2563EB', soft: '#EFF6FF', soft2: '#DBEAFE', text: '#1D4ED8' }, // blue
  '#F59E0B': { hover: '#D97706', soft: '#FFFBEB', soft2: '#FEF3C7', text: '#B45309' }, // amber
  '#8B5CF6': { hover: '#7C3AED', soft: '#F5F3FF', soft2: '#EDE9FE', text: '#6D28D9' }, // violet
};

const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply accent override to CSS vars on document. We set a custom style block
  // for both themes, then they overlay the defaults.
  React.useEffect(() => {
    const a = ACCENT_PRESETS[t.accent] || ACCENT_PRESETS['#10B981'];
    const sheetId = '__accent-override';
    let style = document.getElementById(sheetId);
    if (!style) { style = document.createElement('style'); style.id = sheetId; document.head.appendChild(style); }
    style.textContent = `
      [data-theme="light"] { --accent: ${t.accent}; --accent-hover: ${a.hover}; --accent-soft: ${a.soft}; --accent-soft-2: ${a.soft2}; --accent-text: ${a.text}; }
      [data-theme="dark"]  { --accent: ${t.accent}; --accent-hover: ${a.hover}; --accent-text: ${t.accent}; }
    `;
  }, [t.accent]);

  return (
    <>
      <DesignCanvas>
        <DCSection id="pc" title="PC版（1440px）" subtitle="Slack風チャット + Trello風カンバン + Notion風情報集約 — テーマ切替対応">
          <DCArtboard id="pc-app" label="メインアプリ（インタラクティブ）" width={1440} height={920}>
            <PCApp theme={t.pcTheme}/>
          </DCArtboard>
        </DCSection>

        {t.showMobile && (
          <DCSection id="mobile" title="スマホ版（iPhone 16 Pro / 親指操作）" subtitle="主要9画面 — 添付モックアップに準拠">
            <DCArtboard id="m-list"   label="プロジェクト一覧" width={420} height={860}><Phone theme={t.mobileTheme}><MProjectList/></Phone></DCArtboard>
            <DCArtboard id="m-chat"   label="プロジェクト詳細（チャット）" width={420} height={860}><Phone theme={t.mobileTheme}><MProjectChat/></Phone></DCArtboard>
            <DCArtboard id="m-files"  label="ファイル / 計画書" width={420} height={860}><Phone theme={t.mobileTheme}><MFiles/></Phone></DCArtboard>
            <DCArtboard id="m-cal"    label="カレンダー（週中心）" width={420} height={860}><Phone theme={t.mobileTheme}><MCalendar/></Phone></DCArtboard>
            <DCArtboard id="m-kan"    label="カンバン（横スワイプ）" width={420} height={860}><Phone theme={t.mobileTheme}><MKanban/></Phone></DCArtboard>
            <DCArtboard id="m-task"   label="タスク" width={420} height={860}><Phone theme={t.mobileTheme}><MTasks/></Phone></DCArtboard>
            <DCArtboard id="m-mem"    label="メンバー" width={420} height={860}><Phone theme={t.mobileTheme}><MMembers/></Phone></DCArtboard>
            <DCArtboard id="m-gal"    label="ギャラリー（Instagram風）" width={420} height={860}><Phone theme={t.mobileTheme}><MGallery/></Phone></DCArtboard>
            <DCArtboard id="m-ai"     label="AIアシスタント" width={420} height={860}><Phone theme={t.mobileTheme}><MAI/></Phone></DCArtboard>
            <DCArtboard id="m-new"    label="新規プロジェクト作成" width={420} height={860}><Phone theme={t.mobileTheme}><MNewProject/></Phone></DCArtboard>
          </DCSection>
        )}
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="テーマ">
          <TweakRadio label="PC" value={t.pcTheme} onChange={v => setTweak('pcTheme', v)}
            options={[
              { value: 'light', label: 'ライト' },
              { value: 'dark',  label: 'ダーク' },
            ]}/>
          <TweakRadio label="スマホ" value={t.mobileTheme} onChange={v => setTweak('mobileTheme', v)}
            options={[
              { value: 'light', label: 'ライト' },
              { value: 'dark',  label: 'ダーク' },
            ]}/>
        </TweakSection>

        <TweakSection label="アクセントカラー">
          <TweakColor label="プライマリ" value={t.accent} onChange={v => setTweak('accent', v)}
            options={['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6']}/>
        </TweakSection>

        <TweakSection label="表示">
          <TweakToggle label="スマホ版を表示" value={t.showMobile} onChange={v => setTweak('showMobile', v)}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
