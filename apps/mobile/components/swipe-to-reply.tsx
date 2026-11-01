import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { haptics } from '../lib/haptics'
import {
  isSwipeReplyStart,
  reachedSwipeReply,
  SWIPE_REPLY_ACTIVE_OFFSET,
  SWIPE_REPLY_THRESHOLD,
  swipeReplyOffset,
} from '../lib/swipe-reply'
import type { ThemePalette } from '../lib/theme'

const playThresholdHaptic = haptics.swipeReplyThreshold

// メッセージを右へ引いて離すと返信を始める。閾値に届いた時点で振動し、離すとスプリングで戻る
export function SwipeToReply({
  enabled,
  palette,
  onReply,
  children,
}: React.PropsWithChildren<{
  enabled: boolean
  palette: ThemePalette
  onReply: () => void
}>) {
  const offset = useSharedValue(0)
  const reached = useSharedValue(false)
  const onReplyRef = React.useRef(onReply)
  onReplyRef.current = onReply
  const reply = React.useCallback(() => onReplyRef.current(), [])

  const gesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX(SWIPE_REPLY_ACTIVE_OFFSET)
        .failOffsetX(-SWIPE_REPLY_ACTIVE_OFFSET)
        .failOffsetY([-SWIPE_REPLY_ACTIVE_OFFSET, SWIPE_REPLY_ACTIVE_OFFSET])
        .onTouchesDown((event, state) => {
          'worklet'
          const touch = event.allTouches[0]
          if (event.numberOfTouches !== 1 || !touch || !isSwipeReplyStart(touch.absoluteX)) state.fail()
        })
        .onUpdate((event) => {
          'worklet'
          offset.value = swipeReplyOffset(event.translationX)
          const next = reachedSwipeReply(event.translationX)
          if (next && !reached.value) scheduleOnRN(playThresholdHaptic)
          reached.value = next
        })
        .onEnd((_event, success) => {
          'worklet'
          if (success && reached.value) scheduleOnRN(reply)
        })
        .onFinalize(() => {
          'worklet'
          reached.value = false
          offset.value = withSpring(0)
        }),
    [enabled, offset, reached, reply],
  )

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, SWIPE_REPLY_THRESHOLD], [0, 1]),
  }))

  return (
    <GestureDetector gesture={gesture}>
      <View>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.icon, iconStyle]}
        >
          <Ionicons name="arrow-undo-outline" size={20} color={palette.text3} />
        </Animated.View>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', top: 0, bottom: 0, left: 8, justifyContent: 'center' },
})
