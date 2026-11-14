// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { isAppLocale, localeFromAcceptLanguage, type AppLocale } from '@cairn/shared'

/**
 * アプリへ届ける利用者の表示言語。クライアントが今表示している言語（設定が「システム」でも解決済みのもの）を送るので、それを使う。
 * 送られていない・知らない値なら、リクエストの Accept-Language から決める
 */
export function deliveryLocale(req: Request, requested: unknown): AppLocale {
  return isAppLocale(requested) ? requested : localeFromAcceptLanguage(req.headers.get('accept-language'))
}
