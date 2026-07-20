// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Phase 0（計測）: ワークスペースのストレージ使用量カウンタ。制限・課金はまだかけない。
// アップロード/削除の都度カウンタを増減する。プロジェクト削除などの CASCADE 経由の
// files 削除はここを通らないためカウンタがずれうる（設計どおり。乖離検出用のバックフィルは
// 別途 supabase/migrations の初期バックフィルと同じ SUM(files.file_size) 集計で再計算できる）。
// 詳細: docs/billing-implementation-design.md #4

export async function adjustStorageUsage(workspaceId: string, deltaBytes: number): Promise<void> {
  if (!deltaBytes) return

  const { db, workspaceStorageUsage } = await import('@cairn/db')
  const { sql } = await import('drizzle-orm')

  await db
    .insert(workspaceStorageUsage)
    .values({ workspaceId, originalBytes: Math.max(0, deltaBytes) })
    .onConflictDoUpdate({
      target: workspaceStorageUsage.workspaceId,
      set: {
        originalBytes: sql`${workspaceStorageUsage.originalBytes} + ${deltaBytes}`,
        updatedAt: new Date(),
      },
    })
}
