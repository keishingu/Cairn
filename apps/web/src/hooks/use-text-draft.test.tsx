import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftScope } from './use-draft-scope'
import { useDraftEditor, useDraftField, useTextDraft } from './use-text-draft'
import { clearAllDrafts, readDraft, writeDraft } from '@/lib/drafts/draft-store'

const scope = { userId: 'user-1', workspaceId: 'ws-1' }
const read = (key: string) => readDraft(scope, key)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('テキスト下書きのフック（useTextDraft）', () => {
  it('入力が止まってから書き込み、保存済みの値との差があるときだけ残す', () => {
    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))

    act(() => result.current.update('書きかけ'))
    expect(read('k')).toBeNull()
    act(() => { vi.advanceTimersByTime(500) })

    expect(read('k')).toMatchObject({ value: '書きかけ', base: '元' })
  })

  it('保存済みの値と同じ値に戻したら下書きを消す', () => {
    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))
    act(() => result.current.update('書きかけ'))
    act(() => { vi.advanceTimersByTime(500) })

    act(() => result.current.update('元'))

    expect(read('k')).toBeNull()
  })

  it('アンマウント時に保留中の書き込みを書き切る', () => {
    const { result, unmount } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))
    act(() => result.current.update('書きかけ'))

    unmount()

    expect(read('k')).toMatchObject({ value: '書きかけ' })
  })

  it('pagehide と visibilitychange（hidden）でも書き切る', () => {
    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))
    act(() => result.current.update('一つ目'))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(read('k')).toMatchObject({ value: '一つ目' })

    act(() => result.current.update('二つ目'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })

    expect(read('k')).toMatchObject({ value: '二つ目' })
  })

  it('clear は下書きを消し、保留中の書き込みも取り消す（保存成功・キャンセル後に復活させない）', () => {
    const { result, unmount } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))
    act(() => result.current.update('書きかけ'))
    act(() => { vi.advanceTimersByTime(500) })
    act(() => result.current.update('さらに書いた'))

    act(() => result.current.clear())
    unmount()

    expect(read('k')).toBeNull()
  })

  it('開いたときに残っている下書きを stored で返し、base が変わっていれば baseChanged', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '古い値', updatedAt: Date.now() })

    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '今の値' }))

    expect(result.current.loaded).toBe(true)
    expect(result.current.stored?.value).toBe('書きかけ')
    expect(result.current.baseChanged).toBe(true)
  })

  it('保存済みの値と同じ下書きは復元対象にせず、掃除する', () => {
    writeDraft(scope, 'k', { value: '同じ', base: '古い値', updatedAt: Date.now() })

    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '同じ' }))

    expect(result.current.stored).toBeNull()
    expect(read('k')).toBeNull()
  })

  it('期限切れの下書きは復元しない', () => {
    writeDraft(scope, 'k', { value: '古い', base: '元', updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })

    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))

    expect(result.current.stored).toBeNull()
  })

  it('key が変わったら、保留分を元の key へ書き、新しい key の下書きを読み直す', () => {
    writeDraft(scope, 'b', { value: 'Bの下書き', base: 'B', updatedAt: Date.now() })
    const { result, rerender } = renderHook(
      ({ k, saved }) => useTextDraft({ key: k, savedValue: saved }),
      { initialProps: { k: 'a', saved: 'A' } },
    )
    act(() => result.current.update('Aの書きかけ'))

    rerender({ k: 'b', saved: 'B' })

    expect(read('a')).toMatchObject({ value: 'Aの書きかけ' })
    expect(result.current.stored?.value).toBe('Bの下書き')
  })

  it('ユーザー・ワークスペースを取得できなかったときは、下書きなしで動く（例外にしない）', () => {
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope: null, settled: true }))
    const { result, unmount } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))

    expect(result.current.loaded).toBe(true)
    act(() => result.current.update('書きかけ'))
    unmount()

    expect(window.localStorage.length).toBe(0)
  })

  it('スコープの確定を待つ間は loaded にならない', () => {
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope: null, settled: false }))
    const { result } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))

    expect(result.current.loaded).toBe(false)
  })

  it('保存領域が使えなくても例外にならず、下書きは残らない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { result, unmount } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))

    act(() => result.current.update('書きかけ'))
    expect(() => unmount()).not.toThrow()
    expect(result.current.stored).toBeNull()
  })
})

describe('常時表示の入力欄用フック（useDraftField）', () => {
  it('下書きがなければ保存済みの値で始まる', () => {
    const { result } = renderHook(() => useDraftField({ key: 'k', savedValue: '元' }))

    expect(result.current.value).toBe('元')
    expect(result.current.restored).toBeNull()
  })

  it('下書きがあれば読み込み時に入れて、復元を知らせる', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '古い値', updatedAt: Date.now() })

    const { result } = renderHook(() => useDraftField({ key: 'k', savedValue: '元' }))

    expect(result.current.value).toBe('書きかけ')
    expect(result.current.restored).toEqual({ baseChanged: true })
  })

  it('保存済みの値を取得する前（ready=false）は下書きを判定しない', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '元', updatedAt: Date.now() })
    const { result, rerender } = renderHook(
      ({ ready, saved }) => useDraftField({ key: 'k', savedValue: saved, ready }),
      { initialProps: { ready: false, saved: '' } },
    )
    expect(result.current.restored).toBeNull()

    rerender({ ready: true, saved: '元' })

    expect(result.current.value).toBe('書きかけ')
    expect(result.current.restored).toEqual({ baseChanged: false })
  })

  it('discard で保存済みの値へ戻して下書きを消し、commit で保存値を反映して下書きを消す', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '元', updatedAt: Date.now() })
    const { result } = renderHook(() => useDraftField({ key: 'k', savedValue: '元' }))

    act(() => result.current.discard())
    expect(result.current.value).toBe('元')
    expect(result.current.restored).toBeNull()
    expect(read('k')).toBeNull()

    act(() => result.current.setValue('新しい値'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(read('k')).toMatchObject({ value: '新しい値' })
    act(() => result.current.commit('新しい値'))
    expect(read('k')).toBeNull()
    expect(result.current.value).toBe('新しい値')
  })

  it('保存済みの値が変わっても、編集中の入力は上書きしない。未編集なら追従する', () => {
    const { result, rerender } = renderHook(
      ({ saved }) => useDraftField({ key: 'k', savedValue: saved }),
      { initialProps: { saved: '元' } },
    )
    rerender({ saved: '更新1' })
    expect(result.current.value).toBe('更新1')

    act(() => result.current.setValue('書きかけ'))
    rerender({ saved: '更新2' })

    expect(result.current.value).toBe('書きかけ')
  })

  it('enabled=false（閲覧のみ）では下書きを使わず、保存済みの値に追従するだけ', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '元', updatedAt: Date.now() })
    const { result } = renderHook(() => useDraftField({ key: 'k', savedValue: '元', enabled: false }))

    expect(result.current.value).toBe('元')
    expect(result.current.restored).toBeNull()
  })

  it('復元の判定前（スコープ取得待ち）に入力した値は、後から古い下書きや保存済みの値で上書きされず、下書きとして残る', () => {
    writeDraft(scope, 'k', { value: '古い下書き', base: '元', updatedAt: Date.now() })
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope: null, settled: false }))
    const { result, rerender } = renderHook(() => useDraftField({ key: 'k', savedValue: '元' }))

    act(() => result.current.setValue('今打った値'))
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope, settled: true }))
    rerender()

    expect(result.current.value).toBe('今打った値')
    expect(result.current.restored).toBeNull()
    act(() => { vi.advanceTimersByTime(500) })
    expect(read('k')).toMatchObject({ value: '今打った値' })
  })

  it('enabled が false から true になったら、その時点で下書きを読み直して復元する', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '元', updatedAt: Date.now() })
    const { result, rerender } = renderHook(
      ({ enabled }) => useDraftField({ key: 'k', savedValue: '元', enabled }),
      { initialProps: { enabled: false } },
    )
    expect(result.current.value).toBe('元')
    expect(result.current.restored).toBeNull()

    rerender({ enabled: true })

    expect(result.current.value).toBe('書きかけ')
    expect(result.current.restored).toEqual({ baseChanged: false })
  })
})

describe('セッション終了と保留中の書き込み', () => {
  it('入力の保留中に clearAllDrafts しても、タイマー・pagehide・アンマウントの書き切りで下書きが復活しない', () => {
    const { result, unmount } = renderHook(() => useTextDraft({ key: 'k', savedValue: '元' }))
    act(() => result.current.update('個人的な書きかけ'))

    clearAllDrafts()
    act(() => { vi.advanceTimersByTime(500) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    unmount()

    expect(window.localStorage.length).toBe(0)
  })
})

describe('クリックして編集する欄用フック（useDraftEditor）', () => {
  it('編集を始めたときに下書きを入れて復元を知らせる', () => {
    writeDraft(scope, 'k', { value: '書きかけ', base: '古い値', updatedAt: Date.now() })
    const { result, rerender } = renderHook(({ active }) => useDraftEditor({ key: 'k', savedValue: '元', active }), {
      initialProps: { active: false },
    })
    rerender({ active: true })

    expect(result.current.draft).toBe('書きかけ')
    expect(result.current.restored).toEqual({ baseChanged: true })
  })

  it('復元の判定前に打った入力は古い下書きに上書きされず、通知も出ない', () => {
    writeDraft(scope, 'k', { value: '古い下書き', base: '元', updatedAt: Date.now() })
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope: null, settled: false }))
    const { result, rerender } = renderHook(() => useDraftEditor({ key: 'k', savedValue: '元', active: true }))

    act(() => result.current.setDraft('先に打った'))
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope, settled: true }))
    rerender()

    expect(result.current.draft).toBe('先に打った')
    expect(result.current.restored).toBeNull()
    act(() => { vi.advanceTimersByTime(500) })
    expect(read('k')).toMatchObject({ value: '先に打った' })
  })

  it('編集を閉じたとき保留中の書き込みを書き切り、すぐ開き直しても入力を復元する（メニューの開閉）', () => {
    const { result, rerender } = renderHook(({ active }) => useDraftEditor({ key: 'k', savedValue: '元', active }), {
      initialProps: { active: true },
    })
    act(() => result.current.setDraft('書きかけ'))

    rerender({ active: false })
    expect(read('k')).toMatchObject({ value: '書きかけ' })
    rerender({ active: true })

    expect(result.current.draft).toBe('書きかけ')
    expect(result.current.restored).toEqual({ baseChanged: false })
  })

  it('編集中に保存済みの値が変わっても、入力済みの値は保ち、未編集なら追従する', () => {
    const { result, rerender } = renderHook(({ saved }) => useDraftEditor({ key: 'k', savedValue: saved, active: true }), {
      initialProps: { saved: '元' },
    })
    rerender({ saved: '更新1' })
    expect(result.current.draft).toBe('更新1')

    act(() => result.current.setDraft('書きかけ'))
    rerender({ saved: '更新2' })

    expect(result.current.draft).toBe('書きかけ')
    expect(result.current.restored).toBeNull()
  })

  it('enabled が true から false を経て true に戻ったら、無効の間に変わった下書きを読み直して復元する', () => {
    writeDraft(scope, 'k', { value: '古い下書き', base: '元', updatedAt: Date.now() })
    const { result, rerender } = renderHook(
      ({ enabled }) => useDraftField({ key: 'k', savedValue: '元', enabled }),
      { initialProps: { enabled: true } },
    )
    expect(result.current.value).toBe('古い下書き')

    rerender({ enabled: false })
    writeDraft(scope, 'k', { value: '新しい下書き', base: '元', updatedAt: Date.now() })
    rerender({ enabled: true })

    expect(result.current.value).toBe('新しい下書き')
    expect(result.current.restored).toEqual({ baseChanged: false })
  })
})

describe('保存成功時の finish', () => {
  it('送信時点の値のままなら下書きを消し、保存済みの値へ戻す', () => {
    const { result } = renderHook(() => useDraftEditor({ key: 'k', savedValue: '元', active: true }))
    act(() => result.current.setDraft('送信した値'))
    act(() => { vi.advanceTimersByTime(500) })

    act(() => result.current.finish('送信した値'))

    expect(read('k')).toBeNull()
    expect(result.current.draft).toBe('元')
  })

  it('送信後に打ち足されていたら、新しい入力を消さずに下書きとして残す', () => {
    const { result } = renderHook(() => useDraftEditor({ key: 'k', savedValue: '元', active: true }))
    act(() => result.current.setDraft('送信した値'))
    act(() => result.current.setDraft('送信した値に打ち足し'))

    act(() => result.current.finish('送信した値'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(result.current.draft).toBe('送信した値に打ち足し')
    expect(read('k')).toMatchObject({ value: '送信した値に打ち足し' })
  })
})
