/* global React, Icon, MountainPhoto, Avatar, StatusChip, STATUS,
   Field, StatusChipSelector, CoverPicker, TagPicker, TAG_PRESETS,
   inputStyle, textareaStyle, focusRing, blurRing */
// pc-create-modal.jsx — refined "新規プロジェクト" creation modal (2-column).

const CreateProjectModal = ({ open, onClose, onCreate }) => {
  const [form, setForm] = React.useState({
    title: '', description: '', status: 'plan',
    startDate: '', endDate: '',
    coverIdx: 0,
    tags: [],
  });
  const [errors, setErrors] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);
  const titleRef = React.useRef(null);

  // Reset when opening
  React.useEffect(() => {
    if (open) {
      setForm({ title: '', description: '', status: 'plan', startDate: '', endDate: '', coverIdx: 0, tags: [] });
      setErrors({});
      setSubmitting(false);
      // focus title shortly after enter animation
      setTimeout(() => titleRef.current && titleRef.current.focus(), 80);
    }
  }, [open]);

  // Esc to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Use a fresh DOM node mounted to body so the modal escapes any transformed
  // ancestor (the design-canvas scales artboards, which would otherwise turn
  // `position: fixed` into absolute-within-the-artboard).

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'プロジェクト名を入力してください';
    else if (form.title.trim().length > 60) e.title = '60文字以内で入力してください';
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      e.endDate = '終了日は開始日以降にしてください';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    // Simulate server round-trip; the prototype just closes.
    setTimeout(() => { onCreate && onCreate(form); onClose(); }, 400);
  };

  return ReactDOM.createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <style>{`
        .cpm-backdrop { position: absolute; inset: 0; background: var(--overlay); }
      `}</style>
      <div className="cpm-backdrop" onClick={onClose}/>

      <form onSubmit={submit} style={{
        position: 'relative',
        width: '100%', maxWidth: 960,
        maxHeight: 'calc(100vh - 48px)',
        background: 'var(--card)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <header style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--divider)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--accent-soft)', color: 'var(--accent-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="folder" size={16}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>新規プロジェクト</h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
              山行・合宿・講習会など、計画単位のプロジェクトを作成します
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          ><Icon name="close" size={16}/></button>
        </header>

        {/* Body — 2 columns */}
        <div style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) 360px',
        }}>
          {/* Left — basic info */}
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="プロジェクト名" required error={errors.title} hint={`${form.title.length}/60`} htmlFor="cpm-title">
              <input id="cpm-title" ref={titleRef}
                value={form.title}
                onChange={e => { set('title', e.target.value); if (errors.title) setErrors(x => ({ ...x, title: undefined })); }}
                placeholder="例: 北アルプス縦走計画"
                style={inputStyle(!!errors.title)}
                onFocus={focusRing} onBlur={e => blurRing(e, !!errors.title)}
              />
            </Field>

            <Field label="説明" hint="任意 — メンバーに見える概要" htmlFor="cpm-desc">
              <textarea id="cpm-desc"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="目的・日程の概要・備考など"
                rows={5}
                style={textareaStyle(false)}
                onFocus={focusRing} onBlur={e => blurRing(e, false)}
              />
            </Field>

            <Field label="ステータス" required>
              <StatusChipSelector value={form.status} onChange={v => set('status', v)}/>
            </Field>
          </div>

          {/* Right — meta */}
          <div style={{
            padding: '20px 22px',
            borderLeft: '1px solid var(--divider)',
            background: 'var(--card-2)',
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="開始日" htmlFor="cpm-start">
                  <input id="cpm-start" type="date"
                    value={form.startDate}
                    onChange={e => set('startDate', e.target.value)}
                    style={inputStyle(false)}
                    onFocus={focusRing} onBlur={e => blurRing(e, false)}/>
                </Field>
                <Field label="終了日" error={errors.endDate} htmlFor="cpm-end">
                  <input id="cpm-end" type="date"
                    value={form.endDate}
                    onChange={e => { set('endDate', e.target.value); if (errors.endDate) setErrors(x => ({ ...x, endDate: undefined })); }}
                    min={form.startDate || undefined}
                    style={inputStyle(!!errors.endDate)}
                    onFocus={focusRing} onBlur={e => blurRing(e, !!errors.endDate)}/>
                </Field>
              </div>
            </div>

            <Field label="タグ" hint={`${form.tags.length}件選択`}>
              <TagPicker value={form.tags} onChange={v => set('tags', v)}/>
            </Field>

            <Field label="カバー写真" hint="一覧・パネルで表示">
              <CoverPicker value={form.coverIdx} onChange={v => set('coverIdx', v)}/>
              {/* Preview strip */}
              <div style={{
                marginTop: 10, position: 'relative',
                borderRadius: 8, overflow: 'hidden',
                border: '1px solid var(--border)',
              }}>
                <MountainPhoto idx={form.coverIdx} height={90} flat radius={0}/>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55))',
                  display: 'flex', alignItems: 'flex-end', padding: '8px 10px', gap: 8,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {form.title || 'プロジェクト名'}
                  </span>
                  <StatusChip s={form.status}/>
                </div>
              </div>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <footer style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--divider)',
          background: 'var(--card)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="users" size={12}/>
            作成後にメンバーを招待できます
          </span>
          <div style={{ flex: 1 }}/>
          <button type="button" onClick={onClose} className="btn">キャンセル</button>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ opacity: submitting ? 0.7 : 1 }}>
            {submitting ? '作成中…' : '作成する'}
          </button>
        </footer>
      </form>
    </div>
  ), document.body);
};

Object.assign(window, { CreateProjectModal });
