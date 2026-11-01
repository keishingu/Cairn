import type { NotificationDestination } from './notification-routing'

type Translate = (message: string, values?: Record<string, string | number>) => string

export const QUICK_ACTION_IDS = ['new-task', 'ask-ai', 'new-dm'] as const
export type QuickActionId = (typeof QUICK_ACTION_IDS)[number]

export interface QuickActionItem {
  id: QuickActionId
  title: string
  icon: string
}

// title は i18n カタログのキー。android は app.json の expo-quick-actions の androidIcons に同梱した画像
const QUICK_ACTIONS: Record<QuickActionId, { title: string; ios: string; android: string }> = {
  'new-task': { title: 'Create task', ios: 'symbol:checkmark.circle', android: 'shortcut_task' },
  'ask-ai': { title: 'Ask AI', ios: 'symbol:sparkles', android: 'shortcut_ai' },
  'new-dm': { title: 'Send a DM', ios: 'symbol:bubble.left', android: 'shortcut_dm' },
}

/** 登録する項目。DM の機能が無効なら OS のメニューにも出さない */
export function buildQuickActionItems(input: {
  platform: string
  dmEnabled: boolean
  t: Translate
}): QuickActionItem[] {
  return QUICK_ACTION_IDS.filter((id) => id !== 'new-dm' || input.dmEnabled).map((id) => {
    const action = QUICK_ACTIONS[id]
    return {
      id,
      title: input.t(action.title),
      icon: input.platform === 'android' ? action.android : action.ios,
    }
  })
}

export function quickActionIdFrom(value: unknown): QuickActionId | null {
  return QUICK_ACTION_IDS.find((id) => id === value) ?? null
}

/** open は押すたびに変わる値で、同じ操作をもう一度押したときも遷移先に開き直させる */
export function routeFromQuickAction(id: QuickActionId, open: string): NotificationDestination {
  switch (id) {
    case 'new-task':
      return { kind: 'screen', path: '/(app)/tasks', params: { new: '1', open } }
    case 'ask-ai':
      return { kind: 'screen', path: '/(app)/ai', params: { focus: '1', open } }
    case 'new-dm':
      return { kind: 'screen', path: '/(app)/chats', params: { dm: '1', open } }
  }
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function openQuery(open: string | undefined): string {
  return open ? `&open=${encodeURIComponent(open)}` : ''
}

export function tasksScreenPath(input: { taskId: string | undefined; isNew: boolean; open: string | undefined }): string {
  if (input.taskId) return `/tasks?taskId=${encodeURIComponent(input.taskId)}${openQuery(input.open)}`
  return input.isNew ? `/tasks?new=1${openQuery(input.open)}` : '/tasks'
}

export function aiScreenPath(input: { focus: boolean; open: string | undefined }): string {
  return input.focus ? `/ai?focus=1${openQuery(input.open)}` : '/ai'
}

/**
 * OS へ項目を登録する。同じ内容の再登録は省き、登録し直しが要るときは refresh を使う。
 * Android のショートカットは起動口の activity-alias に結び付き、別アイコンへの切り替えで無効になる。
 */
export function createQuickActionRegistrar(
  setItems: (items: QuickActionItem[]) => Promise<void>,
  onError: (error: unknown) => void,
) {
  let items: QuickActionItem[] | null = null
  let registeredKey: string | null = null

  const register = async (next: QuickActionItem[]) => {
    registeredKey = JSON.stringify(next)
    try {
      await setItems(next)
    } catch (error) {
      registeredKey = null
      onError(error)
    }
  }

  return {
    sync: async (next: QuickActionItem[]) => {
      items = next
      if (registeredKey !== JSON.stringify(next)) await register(next)
    },
    refresh: async () => {
      if (items) await register(items)
    },
  }
}

/** 押された操作を、ログインが済んでアプリの画面へ入るまで預かる。残すのは最後に押した 1 件だけ */
export function createQuickActionInbox() {
  let pending: QuickActionId | null = null
  const listeners = new Set<() => void>()

  return {
    receive: (id: QuickActionId) => {
      pending = id
      listeners.forEach((listener) => listener())
    },
    peek: () => pending,
    take: () => {
      const id = pending
      pending = null
      if (id) listeners.forEach((listener) => listener())
      return id
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
