// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use server'

import { redirect } from 'next/navigation'
import { translate } from '@cairn/shared'
import { getAuthUser } from '@/lib/get-auth-context'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import { parseAuthorizationId } from '@/lib/oidc-consent'
import { createClient } from '@/lib/supabase/server'

export type ConsentActionState = { error: string } | null

/**
 * 同意画面の許可・拒否を Supabase Auth の OAuth 2.1 Server に伝え、外部アプリの redirect_uri へ戻す。
 * 戻り先 URL（code か access_denied と state 付き）は Supabase が組み立てる。
 */
export async function decideOidcAuthorization(
  _previous: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const { locale } = await readRequestLocale()
  const t = (message: string) => translate(locale, message)

  const authorizationId = parseAuthorizationId(formData.get('authorization_id'))
  if (!authorizationId) return { error: t('This sign-in request is invalid. Return to the app and try again.') }

  const { userId, error: authError } = await getAuthUser()
  if (authError || !userId) {
    redirect(`/auth/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`)
  }

  const supabase = await createClient()
  const decision = formData.get('decision')
  const { data, error } =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

  if (error || !data?.redirect_url) {
    console.error('[oauth/consent] decision failed:', error)
    return { error: t('Could not complete the sign-in request. Return to the app and try again.') }
  }
  redirect(data.redirect_url)
}
