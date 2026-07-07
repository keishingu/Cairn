// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'

const VALID_ROLES = ['owner', 'admin', 'member', 'guest'] as const
type WorkspaceRole = (typeof VALID_ROLES)[number]
const VALID_MEMBERSHIP_STATUSES = ['active', 'inactive'] as const
type MembershipStatus = (typeof VALID_MEMBERSHIP_STATUSES)[number]

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId: targetUserId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { role: requestedRole, membershipStatus: requestedMembershipStatus } = body as {
    role?: string
    membershipStatus?: string
  }
  if (!requestedRole && !requestedMembershipStatus) {
    return NextResponse.json(
      { error: 'role または membershipStatus のいずれかが必要です' },
      { status: 422 },
    )
  }
  if (requestedRole && !VALID_ROLES.includes(requestedRole as WorkspaceRole)) {
    return NextResponse.json(
      { error: 'role は owner/admin/member/guest のいずれかが必要です' },
      { status: 422 },
    )
  }
  if (
    requestedMembershipStatus &&
    !VALID_MEMBERSHIP_STATUSES.includes(requestedMembershipStatus as MembershipStatus)
  ) {
    return NextResponse.json(
      { error: 'membershipStatus は active/inactive のいずれかが必要です' },
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
        deactivatedAt: workspaceMembers.deactivatedAt,
        deactivatedBy: workspaceMembers.deactivatedBy,
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.userId, targetUserId),
        ),
      )
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const currentRole = target.role
    const currentMembershipStatus = target.membershipStatus
    const newRole = (requestedRole as WorkspaceRole | undefined) ?? currentRole
    const newMembershipStatus =
      (requestedMembershipStatus as MembershipStatus | undefined) ?? currentMembershipStatus

    // ゲストと通常ロール間の遷移は禁止する。
    // ゲストのアクセス範囲は project_members で表現されるが、通常ロールはWS全体を参照するため、
    // 相互変換すると project_members が実態と乖離した無効データ（ゾンビ）として残り、整合性が壊れる。
    // ゲストを通常メンバーにしたい場合は招待し直す運用とする。
    const isGuestTransition = (currentRole === 'guest') !== (newRole === 'guest')
    if (isGuestTransition) {
      return NextResponse.json(
        { error: 'ゲストと通常ロール間のロール変更はできません。招待し直してください' },
        { status: 422 },
      )
    }

    // admin は owner に関わる変更を行えない
    if (callerRole !== 'owner') {
      if (newRole === 'owner' && newRole !== currentRole) {
        return NextResponse.json(
          { error: 'owner への昇格は owner のみ実行できます' },
          { status: 403 },
        )
      }
      if (
        currentRole === 'owner' &&
        (newRole !== currentRole || newMembershipStatus !== currentMembershipStatus)
      ) {
        return NextResponse.json(
          { error: 'owner の変更は owner のみ実行できます' },
          { status: 403 },
        )
      }
    }

    // active owner を減らす場合、ワークスペースに最低1人の active owner が残るか確認
    const removesActiveOwner =
      currentRole === 'owner' &&
      currentMembershipStatus === 'active' &&
      (newRole !== 'owner' || newMembershipStatus !== 'active')

    if (removesActiveOwner) {
      const ownerCountRows = await db
        .select({ ownerCount: count() })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.role, 'owner'),
            eq(workspaceMembers.membershipStatus, 'active'),
          ),
        )
      const ownerCount = Number(ownerCountRows[0]?.ownerCount ?? 0)

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'ワークスペースには最低1人の active owner が必要です' },
          { status: 422 },
        )
      }
    }

    const membershipPatch =
      newMembershipStatus === currentMembershipStatus
        ? {
            membershipStatus: newMembershipStatus,
            deactivatedAt: target.deactivatedAt,
            deactivatedBy: target.deactivatedBy,
          }
        : newMembershipStatus === 'inactive'
          ? {
              membershipStatus: newMembershipStatus,
              deactivatedAt: new Date(),
              deactivatedBy: ctx.userId,
            }
          : { membershipStatus: newMembershipStatus, deactivatedAt: null, deactivatedBy: null }

    await db
      .update(workspaceMembers)
      .set({
        role: newRole,
        ...membershipPatch,
      })
      .where(
        and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.userId, targetUserId),
        ),
      )

    return NextResponse.json({
      userId: targetUserId,
      role: newRole,
      membershipStatus: newMembershipStatus,
    })
  } catch (err) {
    console.error('[PATCH /api/workspaces/members/[userId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
