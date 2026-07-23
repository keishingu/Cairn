export function resolveOAuthScheme(configuredScheme: string | string[] | undefined): string {
  if (Array.isArray(configuredScheme)) return configuredScheme[0] ?? 'cairn'
  return configuredScheme ?? 'cairn'
}
