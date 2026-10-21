import React from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from './locale-provider'
import { UserAvatar } from './user-avatar'
import type { WorkspaceMemberDto } from '../hooks/use-chat-channels'
import type { ThemePalette } from '../lib/theme'
import type { ProfileSheetAction, ProfileSheetTarget } from '../lib/user-profile-actions'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface Props {
  /** 開く相手。null のときは閉じる */
  target: ProfileSheetTarget | null
  /** ワークスペースメンバー一覧から引いた相手。一覧が未取得・取得失敗なら undefined */
  member: WorkspaceMemberDto | undefined
  membersLoading: boolean
  /** メンバー一覧を取得できなかったときの理由 */
  membersError: string | null
  /** 一覧は取得できたが相手が有効なメンバーにいない */
  notMember: boolean
  onRetryMembers: () => void
  actions: ReadonlyArray<ProfileSheetAction>
  /** 実行中の操作（二重送信を防ぎ、ボタンに進行を出す） */
  pendingAction: ProfileSheetAction | null
  /** 直前の操作で失敗した理由 */
  actionError: string | null
  palette: ThemePalette
  onAction: (action: ProfileSheetAction) => void
  onClose: () => void
}

const ACTION_ICON: Record<ProfileSheetAction, IoniconName> = {
  dm: 'chatbubble-outline',
  mention: 'at-outline',
  block: 'person-remove-outline',
  unblock: 'person-add-outline',
}

/** メッセージの送信者をタップしたときの下シート。人単位の操作（DM・メンション・ブロック）の置き場。 */
export function UserProfileSheet({
  target,
  member,
  membersLoading,
  membersError,
  notMember,
  onRetryMembers,
  actions,
  pendingAction,
  actionError,
  palette,
  onAction,
  onClose,
}: Props) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const busy = pendingAction !== null

  const roleLabel = member
    ? member.role === 'owner'
      ? t('Owner')
      : member.role === 'admin'
        ? t('Admin')
        : member.role === 'guest'
          ? t('Guest')
          : t('Member')
    : null
  const joinedAt = member ? new Date(`${member.joinedAt}T00:00:00`) : null

  const actionLabel = (action: ProfileSheetAction) =>
    action === 'dm'
      ? t('Send a message')
      : action === 'mention'
        ? t('Mention')
        : action === 'block'
          ? t('Block')
          : t('Unblock')

  return (
    <Modal transparent visible={target !== null} animationType="fade" onRequestClose={busy ? () => {} : onClose}>
      <Pressable accessibilityLabel={t('Close')} style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View pointerEvents="box-none" style={styles.sheetWrap}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: insets.bottom + 12 }]}
        >
          <View style={[styles.grip, { backgroundColor: palette.border }]} />
          {target && (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
              <View style={styles.header}>
                <UserAvatar name={target.displayName} url={member?.avatarUrl ?? target.avatarUrl} size={64} />
                <Text accessibilityRole="header" style={[styles.name, { color: palette.text }]} numberOfLines={2}>
                  {member?.displayName ?? target.displayName}
                </Text>
                {roleLabel && (
                  <Text style={[styles.roleBadge, { backgroundColor: palette.card2, color: palette.text3 }]}>{roleLabel}</Text>
                )}
                {target.blocked && (
                  <Text style={[styles.blockedLabel, { color: palette.redText }]}>{t('You have blocked this user')}</Text>
                )}
              </View>

              {membersLoading && !member ? (
                <ActivityIndicator style={styles.loading} color={palette.accent} />
              ) : membersError ? (
                <View accessibilityRole="alert" style={styles.infoError}>
                  <Text style={[styles.errorText, { color: palette.redText }]}>{membersError}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('Retry')} onPress={onRetryMembers} hitSlop={6}>
                    <Text style={[styles.errorAction, { color: palette.redText }]}>{t('Retry')}</Text>
                  </Pressable>
                </View>
              ) : notMember ? (
                <Text accessibilityRole="alert" style={[styles.errorText, styles.center, { color: palette.redText }]}>
                  {t('This user is no longer an active member of the workspace')}
                </Text>
              ) : member ? (
                <View style={styles.info}>
                  {joinedAt && (
                    <Text style={[styles.joined, { color: palette.text4 }]}>
                      {t('Joined {year}/{month}', { year: joinedAt.getFullYear(), month: joinedAt.getMonth() + 1 })}
                    </Text>
                  )}
                  {member.profileAttributes.length > 0 && (
                    <View style={styles.attributes}>
                      {member.profileAttributes.map((attribute) => (
                        <Text
                          key={attribute.id}
                          style={[
                            styles.attribute,
                            {
                              backgroundColor: palette.profileAttributeColors[attribute.color].background,
                              color: palette.profileAttributeColors[attribute.color].text,
                            },
                          ]}
                        >
                          {attribute.name}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {actionError && (
                <Text accessibilityRole="alert" style={[styles.errorText, styles.center, styles.actionError, { color: palette.redText }]}>
                  {actionError}
                </Text>
              )}

              {actions.length > 0 && (
                <View style={styles.actions}>
                  {actions.map((action) => {
                    const destructive = action === 'block'
                    const color = destructive ? palette.redText : palette.text
                    const pending = pendingAction === action
                    return (
                      <Pressable
                        key={action}
                        accessibilityRole="button"
                        accessibilityLabel={`${actionLabel(action)}: ${target.displayName}`}
                        accessibilityState={{ disabled: busy, busy: pending }}
                        disabled={busy}
                        onPress={() => onAction(action)}
                        style={({ pressed }) => [
                          styles.actionButton,
                          { borderTopColor: palette.divider, opacity: busy && !pending ? 0.45 : pressed ? 0.65 : 1 },
                        ]}
                      >
                        {pending ? (
                          <ActivityIndicator size="small" color={color} />
                        ) : (
                          <Ionicons name={ACTION_ICON[action]} size={19} color={color} />
                        )}
                        <Text style={[styles.actionLabel, { color }]}>{actionLabel(action)}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  grip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 6 },
  body: { flexGrow: 0 },
  header: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  name: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  roleBadge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  blockedLabel: { fontSize: 12.5, fontWeight: '600' },
  loading: { marginVertical: 12 },
  info: { alignItems: 'center', gap: 8, paddingBottom: 8 },
  joined: { fontSize: 12.5 },
  attributes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  attribute: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  infoError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 8 },
  errorText: { fontSize: 12.5 },
  errorAction: { fontSize: 12.5, fontWeight: '700' },
  center: { textAlign: 'center' },
  actionError: { marginBottom: 8 },
  actions: { marginTop: 4 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: { fontSize: 15, fontWeight: '600' },
})
