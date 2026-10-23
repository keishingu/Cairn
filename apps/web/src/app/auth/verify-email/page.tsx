// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate } from '@cairn/shared'
import { readRequestLocale } from '@/lib/i18n/request-locale'

export default async function VerifyEmailPage() {
  const { locale } = await readRequestLocale()
  const t = (message: string) => translate(locale, message)

  return (
    <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
        Cairn
      </div>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '32px 28px',
        boxShadow: 'var(--shadow-sm)',
        marginTop: 32,
      }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>📧</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('Confirmation email sent')}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {t('Click the link in the email to activate your account.')}{' '}
          {t('If it does not arrive, check your spam folder.')}
        </div>
      </div>
    </div>
  )
}
