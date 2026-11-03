// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useActionState } from 'react'
import { useT } from '@/components/locale-provider'
import { decideOidcAuthorization, type ConsentActionState } from './actions'

export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const t = useT()
  const [state, formAction, pending] = useActionState<ConsentActionState, FormData>(
    decideOidcAuthorization,
    null,
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="authorization_id" value={authorizationId} />
      {state?.error && (
        <div role="alert" style={{ color: 'var(--red-text)', fontSize: 12.5, marginTop: 12 }}>{state.error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <button className="btn btn-ghost" type="submit" name="decision" value="deny" disabled={pending}>
          {t('Cancel')}
        </button>
        <button className="btn btn-primary" type="submit" name="decision" value="approve" disabled={pending}>
          {t('Allow')}
        </button>
      </div>
    </form>
  )
}
