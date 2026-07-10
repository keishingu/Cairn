import { ANONYMIZED_MEMBER_DISPLAY_NAME } from '@/lib/anonymized-member'

export function memberChunkDisplayName(
  workspaceDisplayName: string | null | undefined,
  profileDisplayName: string | null | undefined,
) {
  const scopedName = workspaceDisplayName?.trim() ?? ''
  if (scopedName === ANONYMIZED_MEMBER_DISPLAY_NAME) return ''
  if (scopedName) return scopedName
  return profileDisplayName?.trim() ?? ''
}
