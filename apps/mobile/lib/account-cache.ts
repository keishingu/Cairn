// クエリキーにユーザー ID を含めないため、サインアウトと別ユーザーへの入れ替えだけを境界にする。
// Web の QueryProvider と同じく、ここ以外で ['me'] を個別に消さない。

export function shouldClearAccountCache(
  event: string,
  previousUserId: string | null,
  nextUserId: string | null,
): boolean {
  if (event === 'SIGNED_OUT') return true
  return previousUserId !== null && previousUserId !== nextUserId
}

/** 通信できず更新に失敗しただけの null はサインアウトではない（保存は残っている） */
export function isSessionConfirmedAbsent(hasSession: boolean, networkFailed: boolean): boolean {
  return !hasSession && !networkFailed
}
