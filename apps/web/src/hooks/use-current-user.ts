import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { CurrentUserDto } from '@/app/api/me/route'

/** Web 内の GET /api/me はすべてこのキーを使う。チャット用の別キーは持たない。 */
export const CURRENT_USER_QUERY_KEY = ['me'] as const

export const CURRENT_USER_FETCH_ERROR_MESSAGE = 'ユーザー情報の取得に失敗しました'

const CURRENT_USER_STALE_TIME_MS = 60_000

export async function fetchCurrentUser(): Promise<CurrentUserDto> {
  const res = await fetchWithAuth('/api/me')
  if (!res.ok) throw new Error(CURRENT_USER_FETCH_ERROR_MESSAGE)
  return res.json()
}

export function useCurrentUser() {
  return useQuery<CurrentUserDto>({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: CURRENT_USER_STALE_TIME_MS,
  })
}

/** クライアントが確定値を知っている部分更新（ステータス・外観など）を共有キャッシュへ書く。 */
export function patchCurrentUserCache(
  queryClient: QueryClient,
  patch: Partial<CurrentUserDto>,
) {
  queryClient.setQueryData<CurrentUserDto>(CURRENT_USER_QUERY_KEY, (current) =>
    current ? { ...current, ...patch } : current,
  )
}

/**
 * 表示名・アバター変更後に呼ぶ。
 * 設定画面と、発言者名・メンバー一覧として同じ情報を出すチャット側のキャッシュを揃える。
 */
export function invalidateCurrentUserProfile(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['workspace-members'] }),
    queryClient.invalidateQueries({ queryKey: ['messages'] }),
    queryClient.invalidateQueries({ queryKey: ['project-members'] }),
    queryClient.invalidateQueries({ queryKey: ['channel-members'] }),
  ])
}

// ワークスペースロールベースの権限ヘルパー。
// バックエンドの permissions.ts（isWorkspaceOwner/Admin/Member）と1対1で対応させる。
// data 未取得の間は false を返すため、ボタンはロール確定までは無効状態になる。
export function useWorkspacePermissions() {
  const { data: me } = useCurrentUser()
  const role = me?.wsRole
  return {
    wsRole: role,
    isOwner: role === 'owner',
    isAdmin: role === 'owner' || role === 'admin',
    isMember: role === 'owner' || role === 'admin' || role === 'member',
    isGuest: role === 'guest',
  }
}
