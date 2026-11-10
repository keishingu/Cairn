import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readDraft, writeDraft } from '@/lib/drafts/draft-store'

const { me, ws } = vi.hoisted(() => ({
  me: { data: undefined as { id: string } | undefined, isError: false },
  ws: { data: undefined as { id: string } | undefined, isError: false },
}))
vi.mock('./use-current-user', () => ({ useCurrentUser: () => me }))
vi.mock('./use-sidebar', () => ({ useSidebarWorkspace: () => ws }))

const entry = { value: '書きかけ', base: '', updatedAt: Date.now() }

describe('useDraftScope', () => {
  beforeEach(() => {
    vi.resetModules()
    me.data = undefined
    ws.data = undefined
  })

  it('ユーザーが確定したら、認証中のユーザー以外の下書きを1回だけ消す', async () => {
    const { useDraftScope } = await vi.importActual<typeof import('./use-draft-scope')>('./use-draft-scope')
    writeDraft({ userId: 'user-1', workspaceId: 'ws-1' }, 'a', entry)
    writeDraft({ userId: 'other', workspaceId: 'ws-1' }, 'a', entry)

    me.data = { id: 'user-1' }
    ws.data = { id: 'ws-1' }
    const { result, rerender } = renderHook(() => useDraftScope())

    expect(result.current.scope).toEqual({ userId: 'user-1', workspaceId: 'ws-1' })
    expect(readDraft({ userId: 'other', workspaceId: 'ws-1' }, 'a')).toBeNull()
    expect(readDraft({ userId: 'user-1', workspaceId: 'ws-1' }, 'a')).not.toBeNull()

    // 同じユーザーでは再掃除しない
    writeDraft({ userId: 'other', workspaceId: 'ws-1' }, 'b', entry)
    rerender()
    expect(readDraft({ userId: 'other', workspaceId: 'ws-1' }, 'b')).not.toBeNull()
  })

  it('ユーザーが未確定の間は何も消さない', async () => {
    const { useDraftScope } = await vi.importActual<typeof import('./use-draft-scope')>('./use-draft-scope')
    writeDraft({ userId: 'other', workspaceId: 'ws-1' }, 'a', entry)

    renderHook(() => useDraftScope())

    expect(readDraft({ userId: 'other', workspaceId: 'ws-1' }, 'a')).not.toBeNull()
  })
})
