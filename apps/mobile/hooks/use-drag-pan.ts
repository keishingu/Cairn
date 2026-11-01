import React from 'react'
import { Gesture } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

// 指を置いた位置からの移動量（pt）と、離したときの速度（pt/ms）
export type DragRelease = { dx: number; dy: number; vx: number; vy: number }

// タップを奪わず、shouldActivate が真になって初めて応答するドラッグ。
// shouldActivate と onDrag は UI スレッドで動くため 'worklet' を付けた関数を渡す
// （手動の activate は JS スレッドからは効かない）。onRelease / onCancel は JS スレッドで呼ばれる
export function useDragPan({
  enabled = true,
  shouldActivate,
  onDrag,
  onRelease,
  onCancel,
}: {
  enabled?: boolean
  shouldActivate: (dx: number, dy: number) => boolean
  onDrag?: (dx: number, dy: number) => void
  onRelease: (release: DragRelease) => void
  onCancel?: () => void
}) {
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const active = useSharedValue(false)
  const callbacksRef = React.useRef({ onRelease, onCancel })
  callbacksRef.current = { onRelease, onCancel }
  const release = React.useCallback((value: DragRelease) => callbacksRef.current.onRelease(value), [])
  const cancel = React.useCallback(() => callbacksRef.current.onCancel?.(), [])

  return React.useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .enabled(enabled)
        .onTouchesDown((event, state) => {
          'worklet'
          if (active.value) return
          // 2 本目の指が載ったらピンチなどに譲る
          const touch = event.allTouches[0]
          if (event.numberOfTouches !== 1 || !touch) {
            state.fail()
            return
          }
          startX.value = touch.absoluteX
          startY.value = touch.absoluteY
        })
        .onTouchesMove((event, state) => {
          'worklet'
          const touch = event.allTouches[0]
          if (active.value || !touch) return
          if (shouldActivate(touch.absoluteX - startX.value, touch.absoluteY - startY.value)) state.activate()
        })
        .onStart(() => {
          'worklet'
          active.value = true
        })
        .onUpdate((event) => {
          'worklet'
          // 移動量は画面基準で測る。動かす対象の中の座標だと、対象ごと動いて値が揺れる
          onDrag?.(event.absoluteX - startX.value, event.absoluteY - startY.value)
        })
        .onEnd((event, success) => {
          'worklet'
          if (!success) {
            scheduleOnRN(cancel)
            return
          }
          scheduleOnRN(release, {
            dx: event.absoluteX - startX.value,
            dy: event.absoluteY - startY.value,
            vx: event.velocityX / 1000,
            vy: event.velocityY / 1000,
          })
        })
        .onFinalize(() => {
          'worklet'
          active.value = false
        }),
    [active, cancel, enabled, onDrag, release, shouldActivate, startX, startY],
  )
}
