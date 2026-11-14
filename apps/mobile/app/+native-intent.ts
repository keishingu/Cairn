import { Platform } from 'react-native'
import { redirectShareSystemPath } from '../lib/share-receive'

// expo-sharing は共有のとき <scheme>://expo-sharing を開く。ルートが無いので受け取り画面へ向ける
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectShareSystemPath(path, Platform.OS)
}
