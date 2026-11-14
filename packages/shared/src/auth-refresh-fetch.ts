// auth-js は一部の 5xx だけを再試行可能とし、その他の 5xx で保存済みセッションを削除する。
export async function fetchWithRetryableAuthRefresh(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  const [input] = args
  const response = await fetch(...args)
  if (response.status < 500 && response.status !== 429) return response

  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!url.pathname.endsWith('/auth/v1/token') || url.searchParams.get('grant_type') !== 'refresh_token') {
    return response
  }
  // Node と DOM の型で Response のコンストラクタと fetch の戻り値が異なる。
  return new Response(null, { status: 503 }) as Awaited<ReturnType<typeof fetch>>
}
