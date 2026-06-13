import React from 'react'
import type { Session } from '@supabase/supabase-js'

// undefined は SecureStore からのセッション復元中を表す。
// AuthGuard（app/_layout.tsx）が復元完了までルートを描画しないため、
// ルート側では通常 null（未ログイン）か Session のどちらかになる。
export const SessionContext = React.createContext<Session | null | undefined>(undefined)

export function useSession(): Session | null | undefined {
  return React.useContext(SessionContext)
}
