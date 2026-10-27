import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { apiFetch } from './api-fetch'
import { supabase } from './supabase'
import { withTimeout } from './with-timeout'

// Expo Go の Android は SDK 53 以降プッシュ通知非対応のためスキップ
const isExpoGo = Constants.appOwnership === 'expo'
export const supportsNotifications = !(isExpoGo && Platform.OS === 'android')

// サーバーは channelId を指定せずに送るため、Android では "default" チャンネルに届く
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'default'

/**
 * Android 13 以降は通知チャンネルが1つも無いと、許可を求めてもダイアログが出ず許可できない。
 * 許可要求とトークン取得の前に必ず呼ぶ。同じ ID で作り直しても設定は保たれる（冪等）。iOS では何もしない
 */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: 'Cairn',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

/**
 * 通知が届く default チャンネルを利用者がオフにしているか。アプリ全体の許可とは別に設定でき、
 * getPermissionsAsync() には現れない。チャンネルを作り直してもアプリから重要度は上げられないので、利用者の設定は上書きしない
 */
export async function isAndroidNotificationChannelDisabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  await ensureAndroidNotificationChannel()
  const channel = await Notifications.getNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID)
  return channel?.importance === Notifications.AndroidImportance.NONE
}

// iOS の getExpoPushTokenAsync() は APNs のデバイストークンが届くまで待ち、届かないと決着しないことがある
const REGISTER_TIMEOUT_MS = 20_000

async function getPushToken(): Promise<string> {
  await ensureAndroidNotificationChannel()
  const projectId =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.['eas']?.projectId
  if (!projectId) throw new Error('EAS projectId is not configured')

  const token = await withTimeout(
    Notifications.getExpoPushTokenAsync({ projectId }),
    REGISTER_TIMEOUT_MS,
    'Timed out getting Expo push token',
  )
  return token.data
}

// 時間切れは Promise.race で見切らず、リクエスト自体を中断する。見切るだけだと通信が裏で続き、
// 列が次へ進んだ後に遅れて届いた POST / DELETE が順序を逆転させる
// 送る直前に、始めたときのユーザーのセッションのまま送る。トークン取得などを待つ間に別アカウントへ切り替わると、
// 切り替え後のアカウントで登録してそのユーザーのオフを無視したり、そのユーザーの登録を外したりしてしまう
async function sendSubscription(method: 'POST' | 'DELETE', expoToken: string, userId: string): Promise<void> {
  const session = (await supabase.auth.getSession()).data.session
  if (session?.user.id !== userId) throw new Error('Signed-in account changed before updating push subscription')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS)
  let response: Response
  try {
    response = await apiFetch(
      '/api/push/subscribe',
      {
        method,
        body: JSON.stringify({ deviceType: 'expo', expoToken }),
        // React Native の AbortSignal 型と DOM の RequestInit の型が食い違うため、実体は同じものとして渡す
        signal: controller.signal as RequestInit['signal'],
      },
      session,
    )
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Timed out updating push subscription')
    throw error
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new Error(`Push subscription ${method} failed: ${response.status}`)
}

// 登録と解除は1本の列で順に実行する。並行すると、オフにした後に遅れて届いた登録が購読を作り直し、
// オフの記録があるため以後の起動では解除もされず、通知が届き続ける
let subscriptionQueue: Promise<unknown> = Promise.resolve()

function enqueueSubscriptionChange<T>(task: () => Promise<T>): Promise<T> {
  const run = subscriptionQueue.then(task, task)
  subscriptionQueue = run.catch(() => undefined)
  return run
}

/**
 * 許可済みの端末の Expo push token をサーバーに登録する。失敗は呼び出し側で扱う。
 * 列の順番が来た時点で shouldRegister を確かめ直し、その間にオフにされていれば登録しない。
 * userId のユーザーがサインインしたままのときだけ送る
 */
export function registerPushToken(userId: string, shouldRegister: () => Promise<boolean>): Promise<void> {
  return enqueueSubscriptionChange(async () => {
    if (!(await shouldRegister())) return
    await sendSubscription('POST', await getPushToken(), userId)
  })
}

/** この端末の Expo push token をサーバーから外す。先に始まった登録が終わってから実行する。失敗は呼び出し側で扱う。 */
export function unregisterPushToken(userId: string): Promise<void> {
  return enqueueSubscriptionChange(async () => {
    await sendSubscription('DELETE', await getPushToken(), userId)
  })
}
