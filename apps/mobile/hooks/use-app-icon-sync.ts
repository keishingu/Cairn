import React from 'react'
import { Alert, AppState, Platform, type AppStateStatus } from 'react-native'
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons'
import { resolveAppIconVariant, type AccentId, type AppearanceTheme } from '@cairn/shared'
import { useT } from '../components/locale-provider'
import { DEFAULT_APP_ICON_VARIANT, toAlternateIconName } from '../lib/app-icon'
import type { ResolvedTheme } from '../lib/theme'

/**
 * ホーム画面のアイコンを外観設定（テーマ・アクセント）に合わせる。appearance が null（未取得）なら触らない。
 * iOS は前面にいる間しか変更できず、変更のたびに OS がアラートを出す。
 * Android は使用中に起動口の activity を切り替えるとタスクが閉じることがあるため、バックグラウンドへ移るときに反映する。
 */
export function useAppIconSync(
  appearance: { theme: AppearanceTheme; accentId: AccentId } | null,
  systemTheme: ResolvedTheme,
): void {
  const t = useT()
  const target = appearance
    ? toAlternateIconName(
        resolveAppIconVariant({ ...appearance, systemTheme, defaultVariant: DEFAULT_APP_ICON_VARIANT }),
      )
    : undefined
  const targetRef = React.useRef(target)
  // render 中に書き換えると、破棄された render の値で AppState のイベントが動きうるため、確定後に反映する
  React.useEffect(() => {
    targetRef.current = target
  }, [target])

  // 起動直後は設定の反映と前面復帰が同時に来る。iOS は変更中に重ねて呼ぶと後の呼び出しを失敗させるため、
  // 実行中は 1 回にまとめ、終わってから最新の設定と照らし合わせる
  const inFlightRef = React.useRef(false)
  const pendingRef = React.useRef(false)
  // iOS は確認表示を短時間に何度も出させず、前面に戻るたびの再試行も失敗し続けることがある。
  // 同じアイコンへの失敗は 1 回だけ知らせる
  const alertedRef = React.useRef<string | null | undefined>(undefined)

  const apply = React.useCallback(() => {
    const name = targetRef.current
    if (name === undefined || !supportsAlternateIcons) return
    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }
    if (getAppIconName() === name) return
    inFlightRef.current = true
    changeIcon(name, IOS_RETRY_COUNT)
      .catch((error: unknown) => {
        console.error(`[app-icon] ${name ?? 'default'} への変更に失敗`, error)
        if (alertedRef.current === name) return
        alertedRef.current = name
        Alert.alert(t('Could not change the app icon.'))
      })
      .finally(() => {
        inFlightRef.current = false
        if (pendingRef.current) {
          pendingRef.current = false
          apply()
        }
      })
  }, [t])

  // iOS は前面に戻った直後に変更すると「リソースが一時的に使用できません」で失敗するため、少し待ってから呼ぶ
  const scheduleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedule = React.useCallback(() => {
    if (Platform.OS !== 'ios') {
      apply()
      return
    }
    if (scheduleRef.current) clearTimeout(scheduleRef.current)
    scheduleRef.current = setTimeout(() => {
      scheduleRef.current = null
      if (AppState.currentState === 'active') apply()
    }, IOS_SETTLE_MS)
  }, [apply])
  React.useEffect(() => () => {
    if (scheduleRef.current) clearTimeout(scheduleRef.current)
  }, [])

  React.useEffect(() => {
    if (Platform.OS === 'ios' && AppState.currentState === 'active') schedule()
  }, [target, schedule])

  React.useEffect(() => {
    const trigger: AppStateStatus = Platform.OS === 'ios' ? 'active' : 'background'
    const sub = AppState.addEventListener('change', (state) => {
      if (state === trigger) schedule()
    })
    return () => sub.remove()
  }, [schedule])
}

const IOS_SETTLE_MS = 1000
const IOS_RETRY_COUNT = 1

// 一時的な失敗（他の確認表示と重なったときなど）は前面にいる間に 1 回だけ再試行する。
// 失敗が返っても実際には切り替わっている場合があるため、現在のアイコンで成否を判断する
async function changeIcon(name: string | null, retriesLeft: number): Promise<void> {
  try {
    await setAlternateAppIcon(name)
  } catch (error) {
    if (getAppIconName() === name) return
    if (Platform.OS !== 'ios' || retriesLeft <= 0) throw error
    await new Promise((resolve) => setTimeout(resolve, IOS_SETTLE_MS))
    if (AppState.currentState !== 'active') return
    await changeIcon(name, retriesLeft - 1)
  }
}
