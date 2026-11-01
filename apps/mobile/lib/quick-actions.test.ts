import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  aiScreenPath,
  buildQuickActionItems,
  createQuickActionInbox,
  createQuickActionRegistrar,
  quickActionIdFrom,
  routeFromQuickAction,
  tasksScreenPath,
  type QuickActionItem,
} from './quick-actions'

const t = (message: string) => `t:${message}`
const items = (title: string): QuickActionItem[] => [{ id: 'new-task', title, icon: 'shortcut_task' }]

describe('クイックアクションの項目', () => {
  it('表示言語の文言で 3 項目を返す', () => {
    expect(buildQuickActionItems({ platform: 'ios', dmEnabled: true, t }).map((item) => item.title)).toEqual([
      't:Create task',
      't:Ask AI',
      't:Send a DM',
    ])
  })

  it('DM が無効なら DM の項目を登録しない', () => {
    expect(buildQuickActionItems({ platform: 'ios', dmEnabled: false, t }).map((item) => item.id)).toEqual([
      'new-task',
      'ask-ai',
    ])
  })

  it('iOS は SF Symbols、Android は同梱の画像を使う', () => {
    const icons = (platform: string) => buildQuickActionItems({ platform, dmEnabled: true, t }).map((item) => item.icon)
    expect(icons('ios').every((icon) => icon.startsWith('symbol:'))).toBe(true)

    const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
      expo: { plugins: unknown[] }
    }
    const plugin = app.expo.plugins.find(
      (entry): entry is [string, { androidIcons: Record<string, unknown> }] =>
        Array.isArray(entry) && entry[0] === 'expo-quick-actions',
    )
    expect(Object.keys(plugin?.[1].androidIcons ?? {}).sort()).toEqual([...icons('android')].sort())
  })

  it('未知の ID は受け付けない', () => {
    expect(quickActionIdFrom('ask-ai')).toBe('ask-ai')
    expect(quickActionIdFrom('other')).toBeNull()
    expect(quickActionIdFrom(undefined)).toBeNull()
  })
})

describe('クイックアクションの遷移先', () => {
  it('scheme に依存せず画面の経路へ変換する', () => {
    expect(routeFromQuickAction('new-task', 'a')).toEqual({
      kind: 'screen',
      path: '/(app)/tasks',
      params: { new: '1', open: 'a' },
    })
    expect(routeFromQuickAction('ask-ai', 'a')).toEqual({
      kind: 'screen',
      path: '/(app)/ai',
      params: { focus: '1', open: 'a' },
    })
    expect(routeFromQuickAction('new-dm', 'a')).toEqual({
      kind: 'screen',
      path: '/(app)/chats',
      params: { dm: '1', open: 'a' },
    })
  })

  it('タスク画面の Web パスを作る', () => {
    expect(tasksScreenPath({ taskId: undefined, isNew: false, open: undefined })).toBe('/tasks')
    expect(tasksScreenPath({ taskId: undefined, isNew: true, open: 'n 1' })).toBe('/tasks?new=1&open=n%201')
    expect(tasksScreenPath({ taskId: 'a/b', isNew: false, open: 'x' })).toBe('/tasks?taskId=a%2Fb&open=x')
  })

  it('AI 画面の Web パスを作る', () => {
    expect(aiScreenPath({ focus: false, open: 'x' })).toBe('/ai')
    expect(aiScreenPath({ focus: true, open: 'x' })).toBe('/ai?focus=1&open=x')
  })
})

describe('クイックアクションの登録', () => {
  it('同じ内容は登録し直さず、言語が変わると登録し直す', async () => {
    const setItems = vi.fn(async () => undefined)
    const registrar = createQuickActionRegistrar(setItems, vi.fn())

    await registrar.sync(items('タスクを作成'))
    await registrar.sync(items('タスクを作成'))
    expect(setItems).toHaveBeenCalledTimes(1)

    await registrar.sync(items('Create task'))
    expect(setItems).toHaveBeenLastCalledWith(items('Create task'))
    expect(setItems).toHaveBeenCalledTimes(2)
  })

  it('アイコンの切り替え後は同じ内容でも登録し直す', async () => {
    const setItems = vi.fn(async () => undefined)
    const registrar = createQuickActionRegistrar(setItems, vi.fn())

    await registrar.sync(items('タスクを作成'))
    await registrar.refresh()

    expect(setItems).toHaveBeenCalledTimes(2)
    expect(setItems).toHaveBeenLastCalledWith(items('タスクを作成'))
  })

  it('項目が決まる前に切り替わっても登録しない', async () => {
    const setItems = vi.fn(async () => undefined)
    await createQuickActionRegistrar(setItems, vi.fn()).refresh()
    expect(setItems).not.toHaveBeenCalled()
  })

  it('登録に失敗したら知らせて、次の同期でやり直す', async () => {
    const error = new Error('failed')
    const setItems = vi.fn<(next: QuickActionItem[]) => Promise<void>>()
    setItems.mockRejectedValueOnce(error).mockResolvedValue(undefined)
    const onError = vi.fn()
    const registrar = createQuickActionRegistrar(setItems, onError)

    await registrar.sync(items('タスクを作成'))
    expect(onError).toHaveBeenCalledWith(error)

    await registrar.sync(items('タスクを作成'))
    expect(setItems).toHaveBeenCalledTimes(2)
  })
})

describe('押された操作の預かり', () => {
  it('取り出すまで保持し、取り出すと空になる', () => {
    const inbox = createQuickActionInbox()
    inbox.receive('new-task')

    expect(inbox.peek()).toBe('new-task')
    expect(inbox.take()).toBe('new-task')
    expect(inbox.take()).toBeNull()
  })

  it('最後に押した操作だけを残す', () => {
    const inbox = createQuickActionInbox()
    inbox.receive('new-task')
    inbox.receive('ask-ai')

    expect(inbox.take()).toBe('ask-ai')
  })

  it('受け取りと取り出しを購読者へ通知する', () => {
    const inbox = createQuickActionInbox()
    const listener = vi.fn()
    const unsubscribe = inbox.subscribe(listener)

    inbox.receive('new-dm')
    inbox.take()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    inbox.receive('new-dm')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
