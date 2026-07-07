// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole, isWorkspaceAdmin } from '@/lib/permissions'
import { deactivateMembership, reactivateMembership } from '@/lib/access/lifecycle'

const VALID_ROLES = ['owner', 'admin', 'member', 'guest'] as const
type WorkspaceRole = (typeof VALID_ROLES)[number]

const VALID_STATUSES = ['active', 'inactive'] as const
type MembershipStatus = (typeof VALID_STATUSES)[number]

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

  const { role: newRole, status: newStatus } = body as { role?: string; status?: string }

  // status 指定があれば「非活性化 / 再活性化」、role 指定があれば「ロール変更」を行う。
  if (newStatus !== undefined) {
    return handleStatusChange(ctx.workspaceId, ctx.userId, targetUserId, newStatus)
  }

  if (!newRole || !VALID_ROLES.includes(newRole as WorkspaceRole)) {
    return NextResponse.json(
      { error: 'role は owner/admin/member/guest のいずれかが必要です' },
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
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, targetUserId)))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const currentRole = target.role

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
    if (currentRole === 'owner' && newRole !== 'owner') {
      const ownerCountRows = await db
        .select({ ownerCount: count() })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.role, 'owner')))
      const ownerCount = Number(ownerCountRows[0]?.ownerCount ?? 0)

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'ワークスペースには最低1人の owner が必要です' },
          { status: 422 },
        )
      }
    }

    await db
      .update(workspaceMembers)
      .set({ role: newRole as WorkspaceRole })
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, targetUserId)))

    return NextResponse.json({ userId: targetUserId, role: newRole })
  } catch (err) {
    console.error('[PATCH /api/workspaces/members/[userId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 非活性化 / 再活性化。admin 以上のみ。owner の活性状態は owner のみ操作可能。
// 自分自身の非活性化は禁止（誤操作で自らのアクセスを失うのを防ぐ）。
async function handleStatusChange(
  workspaceId: string,
  callerUserId: string,
  targetUserId: string,
  status: string,
) {
  if (!VALID_STATUSES.includes(status as MembershipStatus)) {
    return NextResponse.json(
      { error: 'status は active/inactive のいずれかが必要です' },
      { status: 422 },
    )
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const callerRole = await getWorkspaceMemberRole(workspaceId, callerUserId)
    if (!isWorkspaceAdmin(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [target] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)))
      .limit(1)

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // admin は owner の活性状態を変更できない（ロール変更と同じ非対称ルール）
    if (target.role === 'owner' && callerRole !== 'owner') {
      return NextResponse.json(
        { error: 'owner の活性状態は owner のみ変更できます' },
        { status: 403 },
      )
    }

    if (status === 'inactive') {
      if (targetUserId === callerUserId) {
        return NextResponse.json({ error: '自分自身を非活性化することはできません' }, { status: 422 })
      }
      const result = await deactivateMembership(workspaceId, targetUserId, callerUserId)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ userId: targetUserId, status: 'inactive' })
    }

    const result = await reactivateMembership(workspaceId, targetUserId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ userId: targetUserId, status: 'active' })
  } catch (err) {
    console.error('[PATCH /api/workspaces/members/[userId] status]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
