import { describe, expect, it } from 'vitest'
import type { WorkspaceSettingsDto } from '@/app/api/workspaces/settings/route'
import { displayProjectLabel, mergePatchedFields } from './use-workspace-settings'

describe('displayProjectLabel', () => {
  const translate = (message: string) => (message === 'Projects' ? 'プロジェクト' : message)

  it('未設定の呼び方だけを表示言語へ訳す', () => {
    expect(displayProjectLabel(null, translate)).toBe('プロジェクト')
    expect(displayProjectLabel(undefined, translate)).toBe('プロジェクト')
    expect(displayProjectLabel('', translate)).toBe('プロジェクト')
  })

  it('保存済みの呼び方は既定の文言と一致してもそのまま出す', () => {
    expect(displayProjectLabel('Projects', translate)).toBe('Projects')
    expect(displayProjectLabel('プロジェクト', translate)).toBe('プロジェクト')
    expect(displayProjectLabel('山行', translate)).toBe('山行')
  })
})

describe('mergePatchedFields', () => {
  const base: WorkspaceSettingsDto = {
    aiNudgesPhaseOneEnabled: true,
    aiNudgesPhaseTwoEnabled: false,
    aiChatModel: 'gpt-5',
    aiChatSystemPrompt: '新しいプロンプト',
  }

  it('送った項目だけを応答で反映し、並行して保存した別項目を古い応答で戻さない', () => {
    // モデル変更の応答は、プロンプト保存より前に読んだ古いプロンプトを含んでいる
    const staleModelResponse = { ...base, aiChatModel: 'claude-opus-5-5' as const, aiChatSystemPrompt: '古いプロンプト' }

    const merged = mergePatchedFields(base, staleModelResponse, { aiChatModel: 'claude-opus-5-5' })

    expect(merged.aiChatModel).toBe('claude-opus-5-5')
    expect(merged.aiChatSystemPrompt).toBe('新しいプロンプト')
  })

  it('送った項目はサーバーが整形した値（null を含む）で反映する', () => {
    const merged = mergePatchedFields(base, { ...base, aiChatSystemPrompt: null }, { aiChatSystemPrompt: '   ' })

    expect(merged.aiChatSystemPrompt).toBeNull()
  })
})
