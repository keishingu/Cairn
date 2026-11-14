// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProjectMemberRole } from './types'

/** role_id が無い旧データ向け。表示の正は project_roles.name */
export const BUILTIN_PROJECT_ROLE_LABEL: Record<ProjectMemberRole, string> = {
  leader: 'リーダー',
  subleader: 'サブリーダー',
  member: 'メンバー',
  reviewer: 'レビュワー',
  observer: 'オブザーバー',
}

export type ProjectRoleDisplay = {
  /** project_members.role に残している旧 enum */
  legacyRole?: ProjectMemberRole | null | undefined
  /** project_roles.name */
  roleName?: string | null | undefined
  /** project_roles.legacy_role。カスタム役割は null */
  configuredLegacyRole?: ProjectMemberRole | null | undefined
}

/** メンバー詳細など、割り当て済みの役割を常に見せる画面向け */
export function projectRoleLabel(role: ProjectRoleDisplay): string {
  const name = role.roleName?.trim()
  if (name) return name
  if (role.legacyRole) return BUILTIN_PROJECT_ROLE_LABEL[role.legacyRole]
  return BUILTIN_PROJECT_ROLE_LABEL.member
}

/**
 * チャットの役割バッジ。
 * 初期の組み込み「メンバー」だけは従来どおり出さない。
 * 改名した組み込み役割と、legacy が null のカスタム役割は名前を出す。
 */
export function chatProjectRoleLabel(role: ProjectRoleDisplay): string | null {
  const name = role.roleName?.trim()
  if (name) {
    if (
      role.configuredLegacyRole === 'member' &&
      name === BUILTIN_PROJECT_ROLE_LABEL.member
    ) {
      return null
    }
    return name
  }
  if (role.legacyRole && role.legacyRole !== 'member') {
    return BUILTIN_PROJECT_ROLE_LABEL[role.legacyRole]
  }
  return null
}
