/** 下方向のホイール（deltaY > 0）を次の月、上方向を前の月とみなす */
export const MONTH_WHEEL_THRESHOLD = 50

/** 指を上へ動かす（deltaY < 0）と次の月、下へ動かすと前の月 */
export const MONTH_SWIPE_THRESHOLD = 48

export const MONTH_NAV_LOCK_MS = 320

export function monthStepFromWheel(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (deltaY === 0 || Math.abs(deltaX) > Math.abs(deltaY)) return 0
  return deltaY > 0 ? 1 : -1
}

export function monthStepFromSwipe(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaY) < MONTH_SWIPE_THRESHOLD) return 0
  if (Math.abs(deltaX) > Math.abs(deltaY)) return 0
  return deltaY < 0 ? 1 : -1
}
