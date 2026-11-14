import AsyncStorage from '@react-native-async-storage/async-storage'

const WORKSPACE_SELECTION_KEY_PREFIX = 'cairn.workspace-selection'
const cachedSelections = new Map<string, string | null>()
const pendingSelections = new Map<string, Promise<string | null>>()
// 開いたままの画面（チャットなど）が切り替え後のワークスペースで添付を取りに行けるよう、選択の変更を知らせる
type SelectionListener = (userId: string, workspaceId: string) => void
const selectionListeners = new Set<SelectionListener>()

export function subscribeSelectedWorkspace(listener: SelectionListener): () => void {
  selectionListeners.add(listener)
  return () => {
    selectionListeners.delete(listener)
  }
}

function storageKey(userId: string): string {
  return `${WORKSPACE_SELECTION_KEY_PREFIX}:${userId}`
}

export async function getSelectedWorkspaceId(userId: string): Promise<string | null> {
  if (cachedSelections.has(userId)) return cachedSelections.get(userId) ?? null

  const pending = pendingSelections.get(userId)
  if (pending) return pending

  const load = AsyncStorage.getItem(storageKey(userId))
    .then((workspaceId) => {
      cachedSelections.set(userId, workspaceId)
      return workspaceId
    })
    .finally(() => pendingSelections.delete(userId))
  pendingSelections.set(userId, load)
  return load
}

export async function setSelectedWorkspaceId(userId: string, workspaceId: string): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), workspaceId)
  cachedSelections.set(userId, workspaceId)
  for (const listener of selectionListeners) listener(userId, workspaceId)
}
