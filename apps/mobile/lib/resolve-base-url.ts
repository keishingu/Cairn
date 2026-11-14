export type BaseUrlResolution =
  | { ok: true; source: 'environment' | 'metro'; url: string }
  | { ok: false; message: string }

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function metroHostname(hostUri: string | undefined): string | null {
  if (!hostUri) return null

  try {
    const url = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`)
    return url.hostname || null
  } catch {
    return null
  }
}

export function resolveBaseUrl(input: {
  name: string
  configuredUrl: string | undefined
  development: boolean
  hostUri: string | undefined
  developmentPort: number
}): BaseUrlResolution {
  if (input.configuredUrl) {
    const url = normalizeHttpUrl(input.configuredUrl)
    if (!url) {
      return {
        ok: false,
        message: `${input.name} には http または https の URL を設定してください`,
      }
    }
    return { ok: true, source: 'environment', url }
  }

  if (!input.development) {
    return {
      ok: false,
      message: `${input.name} が設定されていません。EAS の対象環境を確認してください`,
    }
  }

  const hostname = metroHostname(input.hostUri)
  if (!hostname) {
    return {
      ok: false,
      message: `Metro の接続先を取得できません。.env.local で ${input.name} を設定してください`,
    }
  }

  const urlHostname = hostname.startsWith('[')
    ? hostname
    : hostname.includes(':')
      ? `[${hostname}]`
      : hostname
  return {
    ok: true,
    source: 'metro',
    url: `http://${urlHostname}:${input.developmentPort}`,
  }
}

export function requireBaseUrl(resolution: BaseUrlResolution): string {
  if (!resolution.ok) throw new Error(resolution.message)
  return resolution.url
}
