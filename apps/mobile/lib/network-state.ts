import type { NetworkState } from 'expo-network'

/**
 * 起動直後など状態が未確定の間は従来どおり送信を試す。
 * 明示的に圏外と判定できた場合だけ通信を止める。
 */
export function shouldAttemptNetworkRequest(
  state: Pick<NetworkState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false
}
