import { describe, expect, it } from 'vitest'
import { parseStoredSession } from './offline-session'

describe('保存済みセッションの復元', () => {
  it('トークンとユーザーが揃っていれば復元する', () => {
    const raw = JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'user-1' } })
    expect(parseStoredSession(raw)?.user.id).toBe('user-1')
  })

  it('保存が無い・壊れている・項目が欠けているときは復元しない', () => {
    expect(parseStoredSession(null)).toBeNull()
    expect(parseStoredSession('{壊れた')).toBeNull()
    expect(parseStoredSession('null')).toBeNull()
    expect(parseStoredSession(JSON.stringify({ access_token: 'a', user: { id: 'u' } }))).toBeNull()
    expect(parseStoredSession(JSON.stringify({ access_token: 'a', refresh_token: 'r' }))).toBeNull()
  })
})
