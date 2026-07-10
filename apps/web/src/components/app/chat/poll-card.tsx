import React from 'react'
import { Icon } from '../primitives'
import { usePoll } from '@/hooks/use-poll'

export const PollCard = ({
  messageId,
  fallbackQuestion,
  compact,
}: {
  messageId: string
  fallbackQuestion: string
  compact?: boolean
}) => {
  const { data, isLoading, isError } = usePoll(messageId)
  const poll = data ?? null
  const title = poll?.question ?? fallbackQuestion

  return (
    <section
      aria-label="投票"
      style={{
        marginTop: 4,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'linear-gradient(180deg, var(--card) 0%, var(--card-2) 100%)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '10px 12px 8px' : '12px 14px 10px', borderBottom: '1px solid var(--divider)' }}>
        <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="list" size={14} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: compact ? 12 : 12.5, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <PollChip label={poll?.allowMultiple ? '複数選択' : '単一選択'} />
            <PollChip label={poll?.anonymous ? '匿名' : '記名'} />
            <PollChip label="投票UIは次スライス" subtle />
          </div>
        </div>
      </div>
      <div style={{ padding: compact ? '10px 12px 12px' : '12px 14px 14px' }}>
        {isLoading ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>投票を読み込み中...</div>
        ) : isError || !poll ? (
          <div style={{ fontSize: 12.5, color: 'var(--red-text)' }}>投票の取得に失敗しました</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {poll.options.map((option) => (
              <div key={option.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: compact ? 12.5 : 13, color: 'var(--text-2)', fontWeight: 500 }}>{option.text}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-4)', flexShrink: 0 }}>{option.voteCount}票</span>
                </div>
                <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: 'var(--card-2)', overflow: 'hidden' }}>
                  <div style={{ width: option.voteCount > 0 ? '100%' : '0%', height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>投票・取消は次のスライスで有効化されます。</div>
          </div>
        )}
      </div>
    </section>
  )
}

const PollChip = ({ label, subtle = false }: { label: string; subtle?: boolean }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 8px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: subtle ? 'transparent' : 'var(--card)',
    color: 'var(--text-3)',
    fontSize: 11,
    fontWeight: 600,
  }}>
    {label}
  </span>
)
