// 添付ファイルの取得は apiFetch を通らない（Image の source・FileSystem.downloadAsync）。
// apiFetch と同じく選択中のワークスペースを X-Cairn-Workspace-Id で伝えないと、サーバーは
// 最初に見つかった所属ワークスペースで判定し、別のワークスペースを開いているときの添付が 403 になる
export type AttachmentAuth = {
  accessToken: string
  /** 選択中のワークスペース。未選択（所属が1つ）のときは null で、サーバー側の既定に任せる */
  workspaceId: string | null
}

export function attachmentRequestHeaders(auth: AttachmentAuth): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${auth.accessToken}` }
  if (auth.workspaceId) headers['X-Cairn-Workspace-Id'] = auth.workspaceId
  return headers
}
