import React from 'react'
import { AppState, Linking, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { Directory, File, Paths } from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClientMessageId } from '../lib/offline-message-queue'
import {
  createShareInbox,
  isShareReceiveUrl,
  parseRecentShareTargets,
  recordRecentShareTarget,
  SHARE_RECEIVE_PATH,
  type IncomingResolvedPayload,
} from '../lib/share-receive'
import { useSession } from '../lib/session-context'

const INBOX_STORAGE_KEY = 'cairn:share-inbox:v1'
const RECENT_TARGETS_STORAGE_PREFIX = 'cairn:share-recent-targets:v1:'
const supported = Platform.OS === 'android'

const inboxDirectory = () => new Directory(Paths.document, 'share-inbox')
// patches/expo-sharing@55.0.24.patch がコピー先にしているキャッシュ内のディレクトリ
const incomingCacheDirectory = () => new Directory(Paths.cache, 'expo-sharing')

function removeDirectory(directory: Directory): void {
  if (directory.exists) directory.delete()
}

const inbox = createShareInbox(
  {
    getPayloads: () => Sharing.getSharedPayloads(),
    resolvePayloads: async () =>
      (await Sharing.getResolvedSharedPayloadsAsync()) as IncomingResolvedPayload[],
    clearPayloads: () => Sharing.clearSharedPayloads(),
    fileSize: (uri) => {
      const file = new File(uri)
      return file.exists ? file.size : null
    },
    storeFile: (uri, id) => {
      const directory = inboxDirectory()
      directory.create({ intermediates: true, idempotent: true })
      const target = new File(directory, id)
      new File(uri).move(target)
      return target.uri
    },
    clearStoredFiles: () => removeDirectory(inboxDirectory()),
    clearIncomingCache: () => removeDirectory(incomingCacheDirectory()),
    load: () => AsyncStorage.getItem(INBOX_STORAGE_KEY),
    save: (value) =>
      value === null
        ? AsyncStorage.removeItem(INBOX_STORAGE_KEY)
        : AsyncStorage.setItem(INBOX_STORAGE_KEY, value),
    createId: createClientMessageId,
    onError: (message, error) => console.warn(`[share-receive] ${message}`, error),
  },
  supported ? { status: 'loading' } : { status: 'idle' },
)

export function discardReceivedShare(): Promise<void> {
  if (!supported) return Promise.resolve()
  return inbox.discard().catch((error) => {
    console.warn('[share-receive] 預かった共有を消せませんでした', error)
  })
}

export function useShareInbox() {
  return React.useSyncExternalStore(inbox.subscribe, inbox.peek)
}

/** 共有を受け取って受信箱へ移す。起動時に前回の分を読み戻してから、起動の Intent を受け取る */
export function useShareReceiveIntake(): void {
  React.useEffect(() => {
    if (!supported) return
    const report = (error: unknown) => console.warn('[share-receive] 受け取りに失敗しました', error)

    void inbox.restore().catch(report)
    void Linking.getInitialURL()
      .then((url) => inbox.intake({ expectShare: isShareReceiveUrl(url) }))
      .catch(report)

    const urlSub = Linking.addEventListener('url', ({ url }) => {
      if (isShareReceiveUrl(url)) void inbox.intake({ expectShare: true }).catch(report)
    })
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void inbox.intake({ expectShare: false }).catch(report)
    })
    return () => {
      urlSub.remove()
      appStateSub.remove()
    }
  }, [])
}

/** 受け取り画面へ移る。(app) はログイン後にだけ描画されるので、未ログインで受けた共有はここで再開する */
export function useShareReceiveNavigation(): void {
  const router = useRouter()
  const signedIn = !!useSession()
  const state = useShareInbox()

  React.useEffect(() => {
    if (!signedIn || !inbox.takeNavigation()) return
    router.navigate(SHARE_RECEIVE_PATH)
  }, [router, signedIn, state])
}

export async function loadRecentShareTargets(userId: string): Promise<string[]> {
  return parseRecentShareTargets(await AsyncStorage.getItem(`${RECENT_TARGETS_STORAGE_PREFIX}${userId}`))
}

export async function rememberShareTarget(userId: string, channelId: string): Promise<void> {
  const recent = await loadRecentShareTargets(userId)
  await AsyncStorage.setItem(
    `${RECENT_TARGETS_STORAGE_PREFIX}${userId}`,
    JSON.stringify(recordRecentShareTarget(recent, channelId)),
  )
}
