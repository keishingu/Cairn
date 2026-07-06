// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

const VALID_ROLES = ['owner', 'admin', 'member', 'guest'] as const
const VALID_STATUSES = ['active', 'inactive'] as const
type WorkspaceRole = (typeof VALID_ROLES)[number]
type WorkspaceMembershipStatus = (typeof VALID_STATUSES)[number]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { role: requestedRole, status: requestedStatus } = body as { role?: string, status?: string }
  const newRole = requestedRole as WorkspaceRole | undefined
  const newStatus = requestedStatus as WorkspaceMembershipStatus | undefined

  if (!newRole && !newStatus) {
    return NextResponse.json(
      { error: 'role か status のいずれかが必要です' },
      { status: 422 },
    )
  }

  if (newRole && !VALID_ROLES.includes(newRole)) {
    return NextResponse.json(
      { error: 'role は owner/admin/member/guest のいずれかが必要です' },
      { status: 422 },
    )
  }

  if (newStatus && !VALID_STATUSES.includes(newStatus)) {
    return NextResponse.json(
      { error: 'status は active/inactive のいずれかが必要です' },
      { status: 422 },
    )
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaceMembers } = await import('@cairn/db')
    const { eq, and, count } = await import('drizzle-orm')

    const callerRole = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    if (!isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [target] = await db
      .select({
        role: workspaceMembers.role,
        membershipStatus: workspaceMembers.membershipStatus,
      })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, targetUserId)))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const currentRole = target.role
    const currentStatus = target.membershipStatus

    // ゲストと通常ロール間の遷移は禁止する。
    // ゲストのアクセス範囲は project_members で表現されるが、通常ロールはWS全体を参照するため、
    // 相互変換すると project_members が実態と乖離した無効データ（ゾンビ）として残り、整合性が壊れる。
    // ゲストを通常メンバーにしたい場合は招待し直す運用とする。
    const isGuestTransition = newRole
      ? (currentRole === 'guest') !== (newRole === 'guest')
      : false
    if (isGuestTransition) {
      return NextResponse.json(
        { error: 'ゲストと通常ロール間のロール変更はできません。招待し直してください' },
        { status: 422 },
      )
    }

    // admin は owner に関わる変更を行えない
    if (callerRole !== 'owner' && newRole) {
      if (newRole === 'owner') {
        return NextResponse.json(
          { error: 'owner への昇格は owner のみ実行できます' },
          { status: 403 },
        )
      }
      if (currentRole === 'owner') {
        return NextResponse.json(
          { error: 'owner のロール変更は owner のみ実行できます' },
          { status: 403 },
        )
      }
    }

    // owner を降格する場合、ワークスペースに最低1人の owner が残るか確認
    if (currentRole === 'owner' && currentStatus === 'active' && newRole && newRole !== 'owner') {
      const ownerCountRows = await db
        .select({ ownerCount: count() })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.role, 'owner'),
          eq(workspaceMembers.membershipStatus, 'active'),
        ))
      const ownerCount = Number(ownerCountRows[0]?.ownerCount ?? 0)

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'ワークスペースには最低1人の owner が必要です' },
          { status: 422 },
        )
      }
    }

    // 最後の active owner は非活性化できない
    if (currentRole === 'owner' && currentStatus === 'active' && newStatus === 'inactive') {
      const activeOwnerCountRows = await db
        .select({ ownerCount: count() })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.role, 'owner'),
          eq(workspaceMembers.membershipStatus, 'active'),
        ))
      const activeOwnerCount = Number(activeOwnerCountRows[0]?.ownerCount ?? 0)

      if (activeOwnerCount <= 1) {
        return NextResponse.json(
          { error: 'ワークスペースには最低1人の active な owner が必要です' },
          { status: 422 },
        )
      }
    }

    const patch: {
      role?: WorkspaceRole
      membershipStatus?: WorkspaceMembershipStatus
      deactivatedAt?: Date | null
      deactivatedBy?: string | null
    } = {}

    if (newRole) {
      patch.role = newRole
    }
    if (newStatus) {
      patch.membershipStatus = newStatus
      if (newStatus === 'inactive') {
        patch.deactivatedAt = new Date()
        patch.deactivatedBy = ctx.userId
      } else {
        patch.deactivatedAt = null
        patch.deactivatedBy = null
      }
    }

    await db
      .update(workspaceMembers)
      .set(patch)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, targetUserId)))

    return NextResponse.json({
      userId: targetUserId,
      role: patch.role ?? currentRole,
      status: patch.membershipStatus ?? currentStatus,
    })
  } catch (err) {
    console.error('[PATCH /api/workspaces/members/[userId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
