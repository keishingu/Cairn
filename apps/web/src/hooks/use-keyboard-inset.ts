import React from 'react'

// iOS Safari / WKWebView はソフトキーボード表示時にレイアウトビューポート（dvh）を縮めないため、
// VisualViewport API で実際の表示領域とのギャップ（≒キーボード高さ）を計測する。
// Android は viewport の interactiveWidget: 'resizes-content' で自動的に縮むため、ここは常に 0 に近い値を返す
export function useKeyboardInset(): number {
  const [inset, setInset] = React.useState(0)

  React.useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
