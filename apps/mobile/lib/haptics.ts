export type HapticFeedback = 'selection' | 'impactLight' | 'success' | 'error'

type HapticPlayer = (feedback: HapticFeedback) => Promise<void>

export function createHaptics(loadPlayer: () => HapticPlayer | null) {
  let player: HapticPlayer | null | undefined
  // 振動は補助の演出なので、失敗しても画面の操作を止めない
  const play = (feedback: HapticFeedback) => {
    void (async () => {
      if (player === undefined) {
        player = null
        player = loadPlayer()
      }
      await player?.(feedback)
    })().catch((error: unknown) => {
      console.warn('[haptics] 振動を再生できませんでした:', error)
    })
  }
  return {
    longPressMenu: () => play('impactLight'),
    reactionAdded: () => play('selection'),
    messageSent: () => play('success'),
    sendFailed: () => play('error'),
    swipeReplyThreshold: () => play('impactLight'),
    refreshStart: () => play('selection'),
  }
}

// react-native は vitest で読み込めないため、実際に鳴らすときまで require しない
function loadNativePlayer(): HapticPlayer | null {
  if (process.env.NODE_ENV === 'test') return null
  const { Platform } = require('react-native') as typeof import('react-native')
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null
  const Haptics = require('expo-haptics') as typeof import('expo-haptics')
  return (feedback) => {
    switch (feedback) {
      case 'selection':
        return Haptics.selectionAsync()
      case 'impactLight':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      case 'success':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      case 'error':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }
}

// 画面からはこの用途別の関数だけを呼ぶ。振動の種類は用途ごとにここで決める
export const haptics = createHaptics(loadNativePlayer)
