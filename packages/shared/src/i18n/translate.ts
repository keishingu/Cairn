// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import i18next from 'i18next'
import type { AppLocale } from '../config/locale'
import { JA_MESSAGES } from './ja'
import { KO_MESSAGES } from './ko'

// 英語の UI 文がキー。ja / ko はカタログを持ち、en と未登録キーは原文を返す。
// keySeparator / nsSeparator を切る。キーに '.' や ':' が含まれていても文のまま引ける。
// プレースホルダは既存の {name}。count は文中の数値で、複数形の語尾はカタログに置かない。
// 言語は t() の lng で渡す。インスタンスの言語は切り替えないので、SSR の同時リクエストで混ざらない。
const i18n = i18next.createInstance()

void i18n.init({
  initAsync: false,
  resources: {
    ja: { translation: JA_MESSAGES },
    ko: { translation: KO_MESSAGES },
  },
  fallbackLng: false,
  supportedLngs: ['ja', 'en', 'ko'],
  load: 'currentOnly',
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  returnEmptyString: false,
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
    skipOnVariables: true,
  },
})

export function translate(
  locale: AppLocale,
  message: string,
  values?: Record<string, string | number>,
): string {
  const translated = i18n.t(message, {
    lng: locale,
    ...values,
  })
  return typeof translated === 'string' ? translated : message
}
