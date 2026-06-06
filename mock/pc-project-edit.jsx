/* global React, Icon, MountainPhoto, STATUS, STATUS_COL */
// pc-project-edit.jsx
// - Shared form atoms (Field, StatusChipSelector, CoverPicker, TagPicker)
// - CreateProjectModal (refined 2-column)
// - StatusPopover (anchored to panel-header status button)
// - PanelSettingsForm (replaces the "準備中" placeholder in ProjectPanel)

// ─── Mock data ───────────────────────────────────────────────────
// In the real app these come from GET /api/projects/tags.
const TAG_PRESETS = [
  { id: 't1',  name: '縦走',         color: 'var(--blue)' },
  { id: 't2',  name: '日帰り',       color: 'var(--emerald)' },
  { id: 't3',  name: '雪山',         color: 'var(--violet)' },
  { id: 't4',  name: '沢登り',       color: 'var(--blue)' },
  { id: 't5',  name: 'クライミング', color: 'var(--amber)' },
  { id: 't6',  name: 'テント泊',     color: 'var(--rose)' },
  { id: 't7',  name: '合宿',         color: 'var(--violet)' },
  { id: 't8',  name: '講習会',       color: 'var(--amber)' },
  { id: 't9',  name: '初心者向け',   color: 'var(--emerald)' },
  { id: 't10', name: 'OB合同',       color: 'var(--text-3)' },
  { id: 't11', name: '装備強化',     color: 'var(--text-3)' },
  { id: 't12', name: '危険度: 高',   color: 'var(--red)' },
];
const STATUS_ORDER = ['plan', 'review', 'wait', 'doing', 'retro', 'done'];

// ─── Field wrapper (label + helper + inline error) ───────────────
const Field = ({ label, hint, required, error, children, htmlFor }) => (
  <label htmlFor={htmlFor} style={{ display: 'block' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
        {label}
        {required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span>}
    </div>
    {children}
    {error && (
      <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--red-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
        {error}
      </div>
    )}
  </label>
);

const inputStyle = (invalid) => ({
  width: '100%', height: 36, padding: '0 12px',
  border: `1px solid ${invalid ? 'var(--red)' : 'var(--border)'}`,
  borderRadius: 8, background: 'var(--card)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .12s, box-shadow .12s',
});
const textareaStyle = (invalid) => ({
  ...inputStyle(invalid), height: 'auto', padding: '10px 12px',
  resize: 'vertical', lineHeight: 1.55, minHeight: 80,
});
const focusRing = (e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--ring)'; };
const blurRing  = (e, invalid) => { e.currentTarget.style.borderColor = invalid ? 'var(--red)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; };

// ─── Status chip selector (color-coded radio chips) ──────────────
const StatusChipSelector = ({ value, onChange, dense = false }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {STATUS_ORDER.map(s => {
      const cfg = STATUS[s];
      const selected = value === s;
      return (
        <button key={s} type="button" onClick={() => onChange(s)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: dense ? '5px 10px' : '7px 12px',
          borderRadius: 999,
          border: `1.5px solid ${selected ? cfg.dot : 'var(--border)'}`,
          background: selected ? cfg.bg : 'var(--card)',
          color: selected ? cfg.fg : 'var(--text-2)',
          fontSize: 12, fontWeight: selected ? 700 : 500,
          fontFamily: 'inherit', cursor: 'pointer',
          transition: 'background .12s, border-color .12s, transform .08s',
        }}
          onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--card-2)'; }}
          onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'var(--card)'; }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }}/>
          {cfg.label}
        </button>
      );
    })}
  </div>
);

// ─── Cover photo picker (horizontal scroll of MountainPhoto thumbs) ─
const CoverPicker = ({ value, onChange }) => (
  <div>
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden',
        padding: '2px 2px 8px', scrollbarWidth: 'thin',
      }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const selected = value === i;
          return (
            <button key={i} type="button" onClick={() => onChange(i)} style={{
              flexShrink: 0, width: 96, height: 64, padding: 0,
              borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
              border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
              outline: selected ? 'none' : '1px solid var(--border)',
              outlineOffset: -1,
              background: 'transparent', position: 'relative',
              transition: 'transform .1s, border-color .12s',
              transform: selected ? 'scale(1.02)' : 'scale(1)',
            }}>
              <MountainPhoto idx={i} height={60} flat radius={6}/>
              {selected && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, rgba(16,185,129,0.0), rgba(16,185,129,0.45))',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                  padding: 5,
                }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                    <Icon name="check" size={11} strokeWidth={3}/>
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {/* Right fade hint */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 8, width: 28,
        background: 'linear-gradient(90deg, transparent, var(--card))',
        pointerEvents: 'none',
      }}/>
    </div>
  </div>
);

// ─── Tag picker (multi-select chips with add/remove) ─────────────
const TagPicker = ({ value, onChange, available = TAG_PRESETS }) => {
  const [open, setOpen] = React.useState(false);
  const selectedTags = available.filter(t => value.includes(t.id));
  const unselected   = available.filter(t => !value.includes(t.id));
  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        minHeight: 36, padding: '5px 6px',
        border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--card)',
      }}>
        {selectedTags.length === 0 && (
          <span style={{ padding: '5px 6px', fontSize: 12, color: 'var(--text-4)' }}>
            タグを選択（任意）
          </span>
        )}
        {selectedTags.map(t => (
          <span key={t.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 4px 3px 8px', borderRadius: 999,
            background: 'var(--card-2)', border: '1px solid var(--border)',
            fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }}/>
            {t.name}
            <button type="button" onClick={() => onChange(value.filter(id => id !== t.id))} style={{
              width: 16, height: 16, borderRadius: '50%', border: 'none',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
            >
              <Icon name="close" size={10} strokeWidth={2.5}/>
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setOpen(o => !o)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 999,
          background: open ? 'var(--accent-soft)' : 'transparent',
          border: `1px dashed ${open ? 'var(--accent)' : 'var(--border-2)'}`,
          color: open ? 'var(--accent-text)' : 'var(--text-3)',
          fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <Icon name="plus" size={11} strokeWidth={2.5}/>
          追加
        </button>
      </div>
      {open && (
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 8,
          background: 'var(--card-2)', border: '1px solid var(--border)',
          maxHeight: 140, overflow: 'auto',
        }}>
          {unselected.length === 0 ? (
            <div style={{ padding: '6px 4px', fontSize: 11.5, color: 'var(--text-4)' }}>すべて選択済みです</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unselected.map(t => (
                <button key={t.id} type="button" onClick={() => onChange([...value, t.id])} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 999,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', fontSize: 11.5, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }}/>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { Field, StatusChipSelector, CoverPicker, TagPicker, TAG_PRESETS, STATUS_ORDER, inputStyle, textareaStyle, focusRing, blurRing });
