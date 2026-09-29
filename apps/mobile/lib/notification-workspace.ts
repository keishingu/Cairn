export type WorkspaceSwitch = 'stay' | 'switch' | 'reject'

/**
 * Push に載ったワークスペースを、今の選択と所属一覧からどう扱うか。
 * ID が無い、または今と同じなら切り替えない。所属に無い ID は捨てる。
 */
export function decideWorkspaceSwitch(
  requestedWorkspaceId: string | undefined,
  currentWorkspaceId: string | null,
  membershipIds: readonly string[],
): WorkspaceSwitch {
  if (!requestedWorkspaceId || requestedWorkspaceId === currentWorkspaceId) return 'stay'
  if (membershipIds.includes(requestedWorkspaceId)) return 'switch'
  return 'reject'
}
