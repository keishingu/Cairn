export function webPath(path: string): string {
  const [pathnamePart, search = ''] = path.split('?')
  const pathname = pathnamePart ?? path
  const params = new URLSearchParams(search)
  params.set('webview', '1')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
