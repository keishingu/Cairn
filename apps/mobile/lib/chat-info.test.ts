import { describe, expect, it } from 'vitest'
import {
  chatInfoKind,
  chatInfoMemberLabel,
  formatFileSize,
  formatProjectDateRange,
  isHexColor,
  sortTasksForChecklist,
} from './chat-info'

const t = (message: string, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message)

describe('チャット情報の表示', () => {
  it('期間は開始・終了の有無で表記を変え、どちらもなければ出さない', () => {
    expect(formatProjectDateRange('2026-04-01', '2026-04-03', t)).toBe('2026/4/1 – 2026/4/3')
    expect(formatProjectDateRange('2026-04-01', null, t)).toBe('2026/4/1 –')
    expect(formatProjectDateRange(null, '2026-04-03', t)).toBe('– 2026/4/3')
    expect(formatProjectDateRange(null, null, t)).toBeNull()
  })

  it('ファイルサイズは単位を切り替え、不明なら空にする', () => {
    expect(formatFileSize(512)).toBe('512B')
    expect(formatFileSize(2048)).toBe('2KB')
    expect(formatFileSize(1572864)).toBe('1.5MB')
    expect(formatFileSize(null)).toBe('')
  })

  it('完了済みのタスクを下にまとめ、グループ内の順序は保つ', () => {
    const sorted = sortTasksForChecklist([
      { id: 'a', status: 'done' },
      { id: 'b', status: 'todo' },
      { id: 'c', status: 'in_progress' },
    ])
    expect(sorted.map((task) => task.id)).toEqual(['b', 'c', 'a'])
  })

  it('プロジェクトを最優先で種別を判定する', () => {
    expect(chatInfoKind('project', 'project-1')).toBe('project')
    expect(chatInfoKind('dm', undefined)).toBe('dm')
    expect(chatInfoKind('workspace', undefined)).toBe('channel')
  })

  it('公開チャンネルだけメンバー欄を出さない', () => {
    expect(chatInfoMemberLabel('channel', false, t)).toBeNull()
    expect(chatInfoMemberLabel('channel', true, t)).toBe('Channel members')
    expect(chatInfoMemberLabel('dm', false, t)).toBe('Participants')
    expect(chatInfoMemberLabel('project', false, t)).toBe('Project members')
  })

  it('6 桁の色だけを描画に使う', () => {
    expect(isHexColor('#10B981')).toBe(true)
    expect(isHexColor('var(--accent)')).toBe(false)
    expect(isHexColor(null)).toBe(false)
  })
})
