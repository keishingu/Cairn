import React from 'react'
import { Keyboard, Platform } from 'react-native'

// キーボード表示中は KeyboardAvoidingView がキーボードとの重なり分を余白に足す。
// シートが下端の安全領域（insets.bottom）も足したままだと、キーボードとの間に余計な隙間ができるため、
// 表示中かどうかで安全領域の余白を出し分けるのに使う。iOS は表示前の will イベントで先に切り替える
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, () => setVisible(true))
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return visible
}
