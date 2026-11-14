import type { CardAction } from '../components/message-card'
import { apiFetch } from './api-fetch'

/** サーバーが返したエラーコードを持つ。文言は cardActionErrorMessage で表示言語にする（Web と同じ） */
export class CardActionError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CardActionError'
  }
}

/** カードのボタン押下・選択をアプリへ届ける。結果のカードはアプリの chat.update が Realtime で届いて置き換わる */
/** revision は描いているカードの版（メッセージの blocksRevision）。サーバーの今のカードと違えば card_changed で断られる */
/** locale は今表示している言語。アプリがモーダルや案内をその言語で返せるよう一緒に送る */
/**
 * onStale は card_changed で断られたときに呼ぶ。他の人の操作でカードが書き換わった後、Realtime の通知を取りこぼしていると
 * 古い版のまま押し続けて断られ続けるため、呼び出し側でメッセージを取り直させる。
 * 取り直しを待ってから失敗を返し、取り直せなかったら card_refresh_failed にして、最新の内容を出せていないことを知らせる（Web と同じ）
 */
export async function postCardAction(messageId: string, revision: string, action: CardAction, locale: string, onStale?: () => void | Promise<void>): Promise<void> {
  const res = await apiFetch('/api/app-interactions', {
    method: 'POST',
    body: JSON.stringify({ messageId, revision, locale, ...action }),
  })
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  const code = typeof body?.error === 'string' ? body.error : 'unknown'
  if (code === 'card_changed' && onStale) {
    try {
      await onStale()
    } catch (err) {
      console.error('[postCardAction] failed to refresh the card after card_changed:', err)
      throw new CardActionError('card_refresh_failed')
    }
  }
  throw new CardActionError(code)
}
