import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readDraft, writeDraft } from '@/lib/drafts/draft-store'
import { signOutCurrentSession } from './sign-out'

const { signOut, getSession } = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn() }))
vi.mock('./client', () => ({ createClient: () => ({ auth: { signOut, getSession } }) }))

const scope = { userId: 'user-1', workspaceId: 'ws-1' }

describe('signOutCurrentSession', () => {
  beforeEach(() => {
    signOut.mockReset()
    getSession.mockReset()
    writeDraft(scope, 'k', { value: '書きかけ', base: '', updatedAt: Date.now() })
  })

  it('サインアウトに成功したら端末の下書きをすべて消す', async () => {
    signOut.mockResolvedValue({ error: null })

    expect(await signOutCurrentSession()).toBe(true)
    expect(readDraft(scope, 'k')).toBeNull()
  })

  it('更新トークン失効でセッションが既に無い場合も消す', async () => {
    signOut.mockResolvedValue({ error: new Error('x') })
    getSession.mockResolvedValue({ error: null, data: { session: null } })

    expect(await signOutCurrentSession()).toBe(true)
    expect(readDraft(scope, 'k')).toBeNull()
  })

  it('サインアウトに失敗したら下書きを消さない', async () => {
    signOut.mockRejectedValue(new Error('network'))

    expect(await signOutCurrentSession()).toBe(false)
    expect(readDraft(scope, 'k')).not.toBeNull()
  })
})
