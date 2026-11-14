import { apiFetch } from './api-fetch'

type Translate = (message: string, values?: Record<string, string | number>) => string

/**
 * 動画添付の再生用 URL を受け取る。OS のプレイヤーは認証ヘッダーを付けられないため、
 * API から Storage の期限つき署名 URL をもらい、それを開く
 */
export async function fetchVideoPlaybackUrl(fileId: string, t: Translate): Promise<string> {
  const res = await apiFetch(`/api/attachments/${encodeURIComponent(fileId)}?as=json`)
  const body = (await res.json().catch(() => ({}))) as { url?: unknown; error?: unknown }
  if (!res.ok || typeof body.url !== 'string') {
    throw new Error(
      typeof body.error === 'string' ? body.error : t('Could not play the video ({status})', { status: res.status }),
    )
  }
  return body.url
}
