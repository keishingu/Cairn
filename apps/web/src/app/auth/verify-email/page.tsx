// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate } from '@cairn/shared'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import { Icon } from '@/components/app/primitives'

export default async function VerifyEmailPage() {
  const { locale } = await readRequestLocale()
  const t = (message: string) => translate(locale, message)

  return (
    <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
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
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--text-3)' }}>
          <Icon name="inbox" size={32} strokeWidth={1.5}/>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{t('Confirmation email sent')}</div>
        <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {t('Click the link in the email to activate your account.')}{' '}
          {t('If it does not arrive, check your spam folder.')}
        </div>
      </div>
    </div>
  )
}
