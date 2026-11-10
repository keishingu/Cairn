import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DRAFT_TTL_MS,
  clearAllDrafts,
  clearDraftsOfOtherUsers,
  clearUserDrafts,
  draftStorageKey,
  pruneExpiredDrafts,
  readDraft,
  removeDraft,
  writeDraft,
} from './draft-store'

const scope = { userId: 'user-1', workspaceId: 'ws-1' }
const entry = (updatedAt: number) => ({ value: '書きかけ', base: '元の値', updatedAt })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('下書きの保存先（draft-store）', () => {
  describe('名前空間', () => {
    it('キーは cairn:draft:{userId}:{workspaceId}:{key}', () => {
      expect(draftStorageKey(scope, 'task:t1:title')).toBe('cairn:draft:user-1:ws-1:task:t1:title')
    })

    it('ユーザー・ワークスペースが違えば同じ key でも別の下書きになる', () => {
      writeDraft(scope, 'task:t1:title', entry(Date.now()))

      expect(readDraft(scope, 'task:t1:title')).not.toBeNull()
      expect(readDraft({ userId: 'user-2', workspaceId: 'ws-1' }, 'task:t1:title')).toBeNull()
      expect(readDraft({ userId: 'user-1', workspaceId: 'ws-2' }, 'task:t1:title')).toBeNull()
    })

    it('value / base / updatedAt をそのまま書いて読める', () => {
      const e = entry(1_700_000_000_000)
      writeDraft(scope, 'k', e)

      expect(readDraft(scope, 'k', 1_700_000_000_000)).toEqual(e)
      expect(JSON.parse(window.localStorage.getItem('cairn:draft:user-1:ws-1:k')!)).toEqual(e)
    })
  })

  describe('有効期限', () => {
    it('7日以内の下書きは読める', () => {
      const now = 1_800_000_000_000
      writeDraft(scope, 'k', entry(now - DRAFT_TTL_MS + 1000))

      expect(readDraft(scope, 'k', now)).not.toBeNull()
    })

    it('7日を過ぎた下書きは読み取り時に捨てて、保存領域からも消す', () => {
      const now = 1_800_000_000_000
      writeDraft(scope, 'k', entry(now - DRAFT_TTL_MS - 1))

      expect(readDraft(scope, 'k', now)).toBeNull()
      expect(window.localStorage.getItem(draftStorageKey(scope, 'k'))).toBeNull()
    })

    it('期限切れの掃除は、他のユーザーの分も含めて古いものだけを消す', () => {
      const now = 1_800_000_000_000
      writeDraft(scope, 'old', entry(now - DRAFT_TTL_MS - 1))
      writeDraft({ userId: 'user-2', workspaceId: 'ws-1' }, 'old', entry(now - DRAFT_TTL_MS - 1))
      writeDraft(scope, 'fresh', entry(now))
      window.localStorage.setItem('cairn:accent', 'emerald')

      pruneExpiredDrafts(now)

      expect(readDraft(scope, 'fresh', now)).not.toBeNull()
      expect(window.localStorage.length).toBe(2)
      expect(window.localStorage.getItem('cairn:accent')).toBe('emerald')
    })

    it('壊れた値や形式の違う値は下書きとして扱わず捨てる', () => {
      const key = draftStorageKey(scope, 'k')
      window.localStorage.setItem(key, '{not json')
      expect(readDraft(scope, 'k')).toBeNull()
      expect(window.localStorage.getItem(key)).toBeNull()

      window.localStorage.setItem(key, JSON.stringify({ value: 1, base: '', updatedAt: 0 }))
      expect(readDraft(scope, 'k')).toBeNull()
      expect(window.localStorage.getItem(key)).toBeNull()
    })
  })

  describe('削除', () => {
    it('removeDraft はその下書きだけを消す', () => {
      writeDraft(scope, 'a', entry(Date.now()))
      writeDraft(scope, 'b', entry(Date.now()))

      removeDraft(scope, 'a')

      expect(readDraft(scope, 'a')).toBeNull()
      expect(readDraft(scope, 'b')).not.toBeNull()
    })

    it('clearUserDrafts は、そのユーザーの下書きをワークスペースを問わず消し、他のユーザーや他のキーは残す', () => {
      writeDraft(scope, 'a', entry(Date.now()))
      writeDraft({ userId: 'user-1', workspaceId: 'ws-2' }, 'b', entry(Date.now()))
      writeDraft({ userId: 'user-2', workspaceId: 'ws-1' }, 'c', entry(Date.now()))
      window.localStorage.setItem('cairn:accent', 'emerald')

      clearUserDrafts('user-1')

      expect(readDraft(scope, 'a')).toBeNull()
      expect(readDraft({ userId: 'user-1', workspaceId: 'ws-2' }, 'b')).toBeNull()
      expect(readDraft({ userId: 'user-2', workspaceId: 'ws-1' }, 'c')).not.toBeNull()
      expect(window.localStorage.getItem('cairn:accent')).toBe('emerald')
    })

    it('clearAllDrafts は全ユーザーの下書きを消し、下書き以外のキーは残す', () => {
      writeDraft(scope, 'a', entry(Date.now()))
      writeDraft({ userId: 'user-2', workspaceId: 'ws-9' }, 'b', entry(Date.now()))
      window.localStorage.setItem('cairn:accent', 'emerald')

      clearAllDrafts()

      expect(window.localStorage.length).toBe(1)
      expect(window.localStorage.getItem('cairn:accent')).toBe('emerald')
    })

    it('clearDraftsOfOtherUsers は認証中のユーザー以外の下書きだけを消す（前方一致の別ユーザーも消す）', () => {
      writeDraft(scope, 'a', entry(Date.now()))
      writeDraft({ userId: 'user-1', workspaceId: 'ws-2' }, 'b', entry(Date.now()))
      writeDraft({ userId: 'user-2', workspaceId: 'ws-1' }, 'c', entry(Date.now()))
      writeDraft({ userId: 'user-10', workspaceId: 'ws-1' }, 'd', entry(Date.now()))

      clearDraftsOfOtherUsers('user-1')

      expect(readDraft(scope, 'a')).not.toBeNull()
      expect(readDraft({ userId: 'user-1', workspaceId: 'ws-2' }, 'b')).not.toBeNull()
      expect(readDraft({ userId: 'user-2', workspaceId: 'ws-1' }, 'c')).toBeNull()
      expect(readDraft({ userId: 'user-10', workspaceId: 'ws-1' }, 'd')).toBeNull()
    })

    it('ユーザー ID が別のユーザー ID の前方一致でも巻き込まない', () => {
      writeDraft({ userId: 'user-1', workspaceId: 'ws-1' }, 'a', entry(Date.now()))
      writeDraft({ userId: 'user-10', workspaceId: 'ws-1' }, 'a', entry(Date.now()))

      clearUserDrafts('user-1')

      expect(readDraft({ userId: 'user-10', workspaceId: 'ws-1' }, 'a')).not.toBeNull()
    })
  })

  describe('保存領域が使えないとき', () => {
    it('書き込みが失敗しても例外にせず false を返す（容量超過など）', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })

      expect(writeDraft(scope, 'k', entry(Date.now()))).toBe(false)
    })

    it('読み取り・削除・掃除が例外を投げても、下書きが無いのと同じに振る舞う', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })

      expect(readDraft(scope, 'k')).toBeNull()
      expect(() => removeDraft(scope, 'k')).not.toThrow()
      expect(() => pruneExpiredDrafts()).not.toThrow()
      expect(() => clearUserDrafts('user-1')).not.toThrow()
      expect(() => clearAllDrafts()).not.toThrow()
      expect(() => clearDraftsOfOtherUsers('user-1')).not.toThrow()
    })

    it('localStorage へのアクセス自体が例外のとき（ブロックされたサイトデータ）も同様', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('SecurityError') })

      expect(writeDraft(scope, 'k', entry(Date.now()))).toBe(false)
      expect(readDraft(scope, 'k')).toBeNull()
      expect(() => removeDraft(scope, 'k')).not.toThrow()
      expect(() => clearUserDrafts('user-1')).not.toThrow()
    })
  })
})
