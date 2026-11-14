import { getNetworkStateAsync } from 'expo-network'
import { shouldAttemptNetworkRequest } from './network-state'

/** 状態を取得できないときは圏外と決めつけず、通信を試す側に倒す */
export async function isDeviceOffline(): Promise<boolean> {
  const state = await getNetworkStateAsync().catch(() => ({}))
  return !shouldAttemptNetworkRequest(state)
}
