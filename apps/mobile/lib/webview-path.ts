export function webPath(path: string): string {
  const hashIndex = path.indexOf('#')
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : ''
  const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const [pathnamePart, search = ''] = pathWithoutHash.split('?')
  const pathname = pathnamePart ?? pathWithoutHash
  const params = new URLSearchParams(search)
  params.set('webview', '1')
  const query = params.toString()
  return `${query ? `${pathname}?${query}` : pathname}${hash}`
}

export function mobileHandoffUrl(
  baseUrl: string,
  path: string,
  tokenHash: string,
  workspaceId?: string,
): string {
  const params = new URLSearchParams({ redirect: webPath(path) })
  if (workspaceId) params.set('workspaceId', workspaceId)
  return `${baseUrl}/auth/mobile-handoff?${params}#th=${encodeURIComponent(tokenHash)}`
}
