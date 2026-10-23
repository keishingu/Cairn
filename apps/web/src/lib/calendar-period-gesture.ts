/** 下方向のホイール（deltaY > 0）を次の月、上方向を前の月とみなす */
export const MONTH_WHEEL_THRESHOLD = 50

/** 指を上へ動かす（deltaY < 0）と次の月、下へ動かすと前の月 */
export const MONTH_SWIPE_THRESHOLD = 48

export const MONTH_NAV_LOCK_MS = 320

/** WheelEvent.DOM_DELTA_LINE。1 ノッチは多くの環境で約 3 行。3 行で 50px 閾値を超える。 */
const WHEEL_LINE_PX = 40

/** WheelEvent.DOM_DELTA_PAGE。1 ページで月を 1 つ送る。 */
const WHEEL_PAGE_PX = 800

/** deltaMode 0 はピクセル、1 は行、2 はページ。蓄積と比較はピクセルに揃える。 */
export function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_PX
  if (deltaMode === 2) return delta * WHEEL_PAGE_PX
  return delta
}

export function monthStepFromWheel(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (deltaY === 0 || Math.abs(deltaX) > Math.abs(deltaY)) return 0
  return deltaY > 0 ? 1 : -1
}

export function monthStepFromSwipe(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaY) < MONTH_SWIPE_THRESHOLD) return 0
  if (Math.abs(deltaX) > Math.abs(deltaY)) return 0
  return deltaY < 0 ? 1 : -1
}
