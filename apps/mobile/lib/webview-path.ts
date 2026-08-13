export function webPath(path: string): string {
  const [pathnamePart, search = ''] = path.split('?')
  const pathname = pathnamePart ?? path
  const params = new URLSearchParams(search)
  params.set('webview', '1')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
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
