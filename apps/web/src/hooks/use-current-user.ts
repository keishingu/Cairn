import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { CurrentUserDto } from '@/app/api/me/route'

export function useCurrentUser() {
  return useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetchWithAuth('/api/me').then(r => r.json()),
    staleTime: 60_000,
  })
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
