// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { pgEnum } from 'drizzle-orm/pg-core'

export const workspaceRoleEnum = pgEnum('workspace_role', [
  'owner',
  'admin',
  'member',
  'guest',
])

export const memberStatusEnum = pgEnum('workspace_member_status', ['active', 'inactive'])

export const userStatusEnum = pgEnum('user_status', [
  'online',
  'away',
  'busy',
  'offline',
])

export const projectMemberRoleEnum = pgEnum('project_member_role', [
  'leader',
  'subleader',
  'member',
  'reviewer',
  'observer',
])

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'attending',
  'tentative',
  'declined',
])

export const messageTypeEnum = pgEnum('message_type', ['text', 'html', 'system'])

export const apiTokenScopeEnum = pgEnum('api_token_scope', ['read', 'write'])

export const fileTypeEnum = pgEnum('file_type', [
  'document',
  'image',
  'video',
  'audio',
  'other',
  'link',
])

export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done'])

export const taskPriorityEnum = pgEnum('task_priority', ['high', 'medium', 'low'])

export const aiScopeEnum = pgEnum('ai_scope', ['workspace', 'project'])

export const channelTypeEnum = pgEnum('channel_type', ['workspace', 'project', 'dm'])

export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',
  'dm',
  'task',
  'file',
  'status',
  'invite',
  'reaction',
  'ai',
])

export const contentReportReasonEnum = pgEnum('content_report_reason', [
  'harassment',
  'discriminatory',
  'sexual',
  'violence',
  'spam',
  'other',
])

export const contentReportStatusEnum = pgEnum('content_report_status', ['open', 'resolved', 'dismissed'])

// 課金プランの UI 名はブランド変更に備えてここへ持ち込まない。
// individual は個人購読、workspace は将来のワークスペース定額を表す。
export const billingPlanEnum = pgEnum('billing_plan', ['individual', 'workspace'])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
])

export const creditLedgerReasonEnum = pgEnum('credit_ledger_reason', [
  'subscription_grant',
  'pack_purchase',
  'ai_consumption',
  'storage_rent',
  'adjustment',
])
