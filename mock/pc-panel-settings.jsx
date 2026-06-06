/* global React, Icon, MountainPhoto, STATUS, STATUS_COL,
   Field, StatusChipSelector, CoverPicker, TagPicker, TAG_PRESETS, STATUS_ORDER,
   inputStyle, textareaStyle, focusRing, blurRing */
// pc-panel-settings.jsx
// - StatusPopover: floating menu anchored to the "計画中 ▾" button in the panel header
// - PanelSettingsForm: real edit form replacing the "準備中" placeholder

// ─── Status popover ──────────────────────────────────────────────
// Renders next to its anchor button using getBoundingClientRect so it lines up
// even when the panel slides in from the right.
const StatusPopover = ({ value, onChange, anchorRect, onClose }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Defer to next frame so the click that opened it doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (!anchorRect) return null;
  const top  = anchorRect.bottom + 6;
  const left = anchorRect.left;

  return ReactDOM.createPortal((
    <div ref={ref} style={{
      position: 'fixed', top, left, zIndex: 50,
      minWidth: 180,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-pop)',
      padding: 4,
    }}>
      {STATUS_ORDER.map(s => {
        const cfg = STATUS[s];
        const selected = value === s;
        return (
          <button key={s} type="button" onClick={() => { onChange(s); onClose(); }} style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%',
            padding: '7px 10px', borderRadius: 6, border: 'none',
            background: selected ? 'var(--card-2)' : 'transparent',
            color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: selected ? 600 : 500, textAlign: 'left',
          }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--card-2)'; }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, flexShrink: 0, boxShadow: `0 0 0 3px ${cfg.bg}` }}/>
            <span style={{ flex: 1 }}>{cfg.label}</span>
            {selected && <Icon name="check" size={13} color="var(--accent)" strokeWidth={2.4}/>}
          </button>
        );
      })}
    </div>
  ), document.body);
};

// ─── Section title used inside the form ──────────────────────────
const FormSection = ({ title, hint, children }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{hint}</div>}
    </div>
    {children}
  </section>
);

// ─── Confirm dialog (for archive) ────────────────────────────────
const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmLabel = 'OK', danger }) => {
  if (!open) return null;
  return ReactDOM.createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 110,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }}/>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 380,
        background: 'var(--card)', borderRadius: 12,
        boxShadow: 'var(--shadow-lg)', padding: 20,
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: danger ? 'var(--red-soft)' : 'var(--accent-soft)',
            color: danger ? 'var(--red-text)' : 'var(--accent-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="archive" size={17}/>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn">キャンセル</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="btn" style={{
            background: danger ? 'var(--red)' : 'var(--accent)',
            color: '#fff', borderColor: danger ? 'var(--red)' : 'var(--accent)', fontWeight: 600,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  ), document.body);
};

// ─── PanelSettingsForm ───────────────────────────────────────────
// Takes the current project from the panel host and an onChange callback so
// updates propagate to the panel header (status chip, hero title, etc.).
const PanelSettingsForm = ({ project, onChange }) => {
  const [draft, setDraft] = React.useState(project);
  const [errors, setErrors] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);
  const [archiving, setArchiving] = React.useState(false);

  // Sync if parent updates (e.g. status popover change).
  React.useEffect(() => { setDraft(project); }, [project]);

  const set = (k, v) => setDraft(prev => ({ ...prev, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(project);

  const validate = () => {
    const e = {};
    if (!draft.title.trim()) e.title = 'タイトルを入力してください';
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      e.endDate = '終了日は開始日以降にしてください';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    onChange && onChange(draft);
    setSavedAt(new Date());
    setTimeout(() => setSavedAt(null), 2400);
  };
  const reset = () => { setDraft(project); setErrors({}); };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '16px 16px 88px',
        display: 'flex', flexDirection: 'column', gap: 22,
      }}>
        {/* Basic */}
        <FormSection title="基本情報">
          <Field label="タイトル" required error={errors.title} htmlFor="ps-title">
            <input id="ps-title"
              value={draft.title}
              onChange={e => { set('title', e.target.value); if (errors.title) setErrors(x => ({ ...x, title: undefined })); }}
              placeholder="プロジェクト名"
              style={inputStyle(!!errors.title)}
              onFocus={focusRing} onBlur={e => blurRing(e, !!errors.title)}
            />
          </Field>
          <Field label="説明" htmlFor="ps-desc">
            <textarea id="ps-desc"
              value={draft.description}
              onChange={e => set('description', e.target.value)}
              placeholder="このプロジェクトの目的・概要"
              rows={4}
              style={textareaStyle(false)}
              onFocus={focusRing} onBlur={e => blurRing(e, false)}
            />
          </Field>
          <Field label="ステータス">
            <StatusChipSelector value={draft.status} onChange={v => set('status', v)} dense/>
          </Field>
        </FormSection>

        {/* Schedule */}
        <FormSection title="日程">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="開始日" htmlFor="ps-start">
              <input id="ps-start" type="date" value={draft.startDate}
                onChange={e => set('startDate', e.target.value)}
                style={inputStyle(false)}
                onFocus={focusRing} onBlur={e => blurRing(e, false)}/>
            </Field>
            <Field label="終了日" error={errors.endDate} htmlFor="ps-end">
              <input id="ps-end" type="date" value={draft.endDate}
                onChange={e => { set('endDate', e.target.value); if (errors.endDate) setErrors(x => ({ ...x, endDate: undefined })); }}
                min={draft.startDate || undefined}
                style={inputStyle(!!errors.endDate)}
                onFocus={focusRing} onBlur={e => blurRing(e, !!errors.endDate)}/>
            </Field>
          </div>
        </FormSection>

        {/* Cover */}
        <FormSection title="カバー写真" hint="パネルヘッダーと一覧カードに表示されます">
          <CoverPicker value={draft.coverIdx} onChange={v => set('coverIdx', v)}/>
        </FormSection>

        {/* Tags */}
        <FormSection title="タグ" hint="プロジェクトの分類・検索に使用">
          <TagPicker value={draft.tags} onChange={v => set('tags', v)}/>
        </FormSection>

        {/* Danger zone */}
        <FormSection title="危険な操作">
          <div style={{
            border: '1px solid var(--red)',
            borderRadius: 10,
            background: 'var(--red-soft)',
            padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--card)', color: 'var(--red-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                border: '1px solid var(--red)',
              }}>
                <Icon name="archive" size={15}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red-text)' }}>プロジェクトをアーカイブ</div>
                <div style={{ fontSize: 11.5, color: 'var(--red-text)', opacity: 0.85, marginTop: 2, lineHeight: 1.5 }}>
                  アーカイブされたプロジェクトは一覧から非表示になり、編集できなくなります。後から復元できます。
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setArchiving(true)} style={{
              marginTop: 12, width: '100%',
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--red)',
              color: 'var(--red-text)', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.color = 'var(--red-text)'; }}
            >
              <Icon name="archive" size={13}/> アーカイブする
            </button>
          </div>
        </FormSection>
      </div>

      {/* Sticky save bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '10px 16px',
        background: dirty ? 'var(--card)' : 'transparent',
        borderTop: dirty ? '1px solid var(--divider)' : 'none',
        boxShadow: dirty ? '0 -6px 16px rgba(15,23,42,0.05)' : 'none',
        display: 'flex', alignItems: 'center', gap: 10,
        transition: 'background .15s, border-color .15s',
        pointerEvents: dirty || savedAt ? 'auto' : 'none',
      }}>
        {savedAt ? (
          <span style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, animation: 'fadeInUp .2s' }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={11} strokeWidth={3}/>
            </span>
            保存しました
          </span>
        ) : dirty ? (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }}/>
            未保存の変更があります
          </span>
        ) : null}
        <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }`}</style>
        <div style={{ flex: 1 }}/>
        {dirty && (
          <>
            <button type="button" onClick={reset} className="btn" style={{ height: 32 }}>変更を破棄</button>
            <button type="button" onClick={save} className="btn btn-primary" style={{ height: 32 }}>保存する</button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => {}}
        title="このプロジェクトをアーカイブしますか？"
        message="一覧から非表示になり、メンバーは閲覧専用になります。アーカイブ済みのフィルタからいつでも復元できます。"
        confirmLabel="アーカイブする"
        danger
      />
    </div>
  );
};

Object.assign(window, { StatusPopover, PanelSettingsForm });
