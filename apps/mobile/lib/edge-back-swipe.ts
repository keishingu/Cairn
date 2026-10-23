// 画面の左端から始めた横スワイプだけを「戻る」として扱う判定
const EDGE_WIDTH = 28
const MIN_DISTANCE = 14
const HORIZONTAL_RATIO = 1.4

export function isEdgeBackSwipe(gesture: { moveX: number; dx: number; dy: number }): boolean {
  // PanResponder の x0 は応答者になった後（grant）にしか設定されず、判定時点では常に 0 になる。
  // 開始位置は現在位置から移動量を引いて求める
  const startX = gesture.moveX - gesture.dx
  return (
    startX <= EDGE_WIDTH &&
    gesture.dx > MIN_DISTANCE &&
    Math.abs(gesture.dx) > Math.abs(gesture.dy) * HORIZONTAL_RATIO
  )
}
