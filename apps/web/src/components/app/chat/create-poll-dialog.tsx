import React from 'react'
import { Switch, Icon } from '../primitives'
import { useCreatePoll } from '@/hooks/use-poll'

const MIN_OPTIONS = 2

export const CreatePollDialog = ({
  channelId,
  onClose,
}: {
  channelId: string
  onClose: () => void
}) => {
  const createPoll = useCreatePoll(channelId)
  const [question, setQuestion] = React.useState('')
  const [options, setOptions] = React.useState(['', ''])
  const [allowMultiple, setAllowMultiple] = React.useState(false)
  const [anonymous, setAnonymous] = React.useState(false)

  const trimmedQuestion = question.trim()
  const trimmedOptions = options.map((option) => option.trim())
  const filledOptions = trimmedOptions.filter(Boolean)
  const canSubmit =
    trimmedQuestion.length > 0 &&
    filledOptions.length >= MIN_OPTIONS &&
    !createPoll.isPending

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)))
  }

  const removeOption = (index: number) => {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)))
  }

  const submit = () => {
    if (!canSubmit) return
    createPoll.mutate(
      {
        question: trimmedQuestion,
        options: filledOptions,
        allowMultiple,
        anonymous,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="投票を作成" style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.48)', padding: 16 }}>
      <div style={{ width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', borderRadius: 18, background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>投票を作成</div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-4)' }}>質問と選択肢を入れると、チャンネルに投票カードとして投稿されます。</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16, padding: 20 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>質問</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例: 来月の定例はどの日がよさそう？"
              rows={3}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', color: 'var(--text)', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>選択肢</span>
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ''])}
                disabled={options.length >= 10}
                style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: options.length >= 10 ? 'default' : 'pointer', opacity: options.length >= 10 ? 0.5 : 1 }}
              >
                選択肢を追加
              </button>
            </div>
            {options.map((option, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, textAlign: 'center', fontSize: 12, color: 'var(--text-4)', flexShrink: 0 }}>{index + 1}</span>
                <input
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  placeholder={`選択肢 ${index + 1}`}
                  style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', color: 'var(--text)', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' }}
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={options.length <= MIN_OPTIONS}
                  title="選択肢を削除"
                  style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: options.length <= MIN_OPTIONS ? 'default' : 'pointer', opacity: options.length <= MIN_OPTIONS ? 0.4 : 1, padding: 4 }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>複数選択を許可</div>
                <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--text-4)' }}>あとで投票機能が有効になった時に、複数の候補を選べる設定にします。</div>
              </div>
              <Switch checked={allowMultiple} onChange={setAllowMultiple} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>匿名投票</div>
                <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--text-4)' }}>票数だけ表示し、誰が投票したかは出しません。</div>
              </div>
              <Switch checked={anonymous} onChange={setAnonymous} />
            </label>
          </div>

          {createPoll.isError && (
            <div style={{ borderRadius: 10, border: '1px solid var(--red)', background: 'var(--red-soft)', color: 'var(--red-text)', padding: '10px 12px', fontSize: 12.5 }}>
              {createPoll.error.message}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 20px' }}>
          <button type="button" onClick={onClose} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            キャンセル
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit} style={{ border: 'none', background: canSubmit ? 'var(--accent)' : 'var(--border-2)', color: canSubmit ? 'var(--on-accent)' : 'var(--text-4)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default' }}>
            {createPoll.isPending ? '作成中...' : '投票を投稿'}
          </button>
        </div>
      </div>
    </div>
  )
}
