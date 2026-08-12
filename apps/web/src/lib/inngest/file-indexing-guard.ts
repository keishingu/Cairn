// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db, files } from '@cairn/db'
import { and, eq } from 'drizzle-orm'
import { lockActiveMembership } from '@/lib/access/active-membership-lock'

export async function runForActiveFileUploader<T>(
  fileId: string,
  workspaceId: string,
  action: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    const [file] = await tx
      .select({ uploadedBy: files.uploadedBy })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.workspaceId, workspaceId)))
      .limit(1)
    if (!file || !(await lockActiveMembership(tx, workspaceId, file.uploadedBy))) return null

    // membership→fileの順にロックしてaccount deletionと揃え、deadlockと確認後の削除を防ぐ。
    const [lockedFile] = await tx
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.workspaceId, workspaceId)))
      .for('share')
      .limit(1)
    if (!lockedFile) return null
    return action(tx)
  })
}
