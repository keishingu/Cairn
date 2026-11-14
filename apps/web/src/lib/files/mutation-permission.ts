// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 閲覧可能なファイルについて、操作主体が更新・削除できるか判定する。
// role は同一ワークスペースの active membership から取得すること。
export function canManageAccessibleFile(userId: string, uploadedBy: string, role: string | null): boolean {
  return role !== null && (uploadedBy === userId || role === 'owner' || role === 'admin')
}
