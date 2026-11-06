import { useQuery } from '@tanstack/react-query'
import { fetchApiJson } from '../lib/fetch-api-json'
import { useT } from '../components/locale-provider'

export interface UploadRightsDto {
  canUploadVideo: boolean
  canDownloadOriginal: boolean
}

/**
 * 自分が動画を送れるか・原本を取得できるか（Solo 支援者本人、または課金無効）。
 * アプリは課金の導線を出さないため、送れる人にだけボタンを出す。判定の正はサーバーの 403
 */
export function useUploadRights(enabled = true) {
  const t = useT()
  return useQuery({
    queryKey: ['upload-rights'],
    queryFn: () =>
      fetchApiJson<UploadRightsDto>(
        '/api/billing/upload-rights',
        t('Could not load upload permissions ({status})'),
      ),
    staleTime: 60_000,
    enabled,
  })
}
