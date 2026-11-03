// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// ID トークンの署名鍵（docs/oidc-design.md §7・§8）。Supabase の鍵とは別の、Cairn 専用の ES256 の鍵で署名する。
// Supabase Auth も Cairn の API も、この鍵で署名されたトークンを受け付けないため、外部アプリの手元に
// ID トークンが残っても Cairn のアカウントやデータには触れられない。
// 鍵は環境変数 OIDC_SIGNING_KEYS に、kid 付きの秘密鍵（JWK）の配列で置く。先頭を署名に使い、
// 残りは入れ替え中の旧鍵として JWKS にだけ載せる。
import { importJWK, SignJWT, type JWK, type JWTPayload } from 'jose'

export class OidcConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OidcConfigError'
  }
}

type SigningJwk = JWK & { kty: 'EC'; crv: 'P-256'; x: string; y: string; kid: string; d: string }

function readSigningKeys(): SigningJwk[] {
  const raw = process.env['OIDC_SIGNING_KEYS']
  if (!raw) throw new OidcConfigError('OIDC_SIGNING_KEYS is not set')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new OidcConfigError('OIDC_SIGNING_KEYS is not valid JSON')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new OidcConfigError('OIDC_SIGNING_KEYS must be a non-empty array of JWKs')
  }
  return parsed.map((key, index) => {
    const jwk = key as Partial<SigningJwk>
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y || !jwk.kid) {
      throw new OidcConfigError(`OIDC_SIGNING_KEYS[${index}] must be an ES256 (P-256) private JWK with kid`)
    }
    return jwk as SigningJwk
  })
}

/** 外部アプリが ID トークンを検証するための公開鍵。秘密の値（d）は含めない */
export function getOidcPublicJwks(): { keys: JWK[] } {
  return {
    keys: readSigningKeys().map(({ kty, crv, x, y, kid }) => ({ kty, crv, x, y, kid, alg: 'ES256', use: 'sig' })),
  }
}

export async function signOidcIdToken(
  claims: JWTPayload,
  options: { issuer: string; audience: string; subject: string; expiresInSeconds: number },
): Promise<string> {
  const [current] = readSigningKeys()
  if (!current) throw new OidcConfigError('OIDC_SIGNING_KEYS is empty')
  const key = await importJWK({ ...current, alg: 'ES256' }, 'ES256')
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: current.kid, typ: 'JWT' })
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setSubject(options.subject)
    .setIssuedAt()
    .setExpirationTime(`${options.expiresInSeconds}s`)
    .sign(key)
}
