const NATIVE_APPLICATION_SCHEMES: Record<string, string> = {
  'com.oss-cairn.dev': 'cairn-dev',
  'com.oss_cairn.dev': 'cairn-dev',
  'com.oss-cairn.preview': 'cairn-preview',
  'com.oss_cairn.preview': 'cairn-preview',
  'com.oss-cairn': 'cairn',
  'com.oss_cairn': 'cairn',
}

export function resolveOAuthScheme(applicationId: string | null): string {
  return applicationId ? (NATIVE_APPLICATION_SCHEMES[applicationId] ?? 'cairn') : 'cairn'
}
