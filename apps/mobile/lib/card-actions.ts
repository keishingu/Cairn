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
export async function postCardAction(messageId: string, revision: string, action: CardAction, locale: string): Promise<void> {
  const res = await apiFetch('/api/app-interactions', {
    method: 'POST',
    body: JSON.stringify({ messageId, revision, locale, ...action }),
  })
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  throw new CardActionError(typeof body?.error === 'string' ? body.error : 'unknown')
}
