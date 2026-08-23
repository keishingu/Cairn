import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useWorkspaceList,
  type WorkspaceDto,
  type WorkspaceListItemDto,
} from '../hooks/use-account'
import { useSession } from '../lib/session-context'
import { setSelectedWorkspaceId } from '../lib/workspace-selection'
import { useAppAppearance } from './appearance-provider'

interface WorkspaceSwitcherModalProps {
  currentWorkspaceId?: string | undefined
  visible: boolean
  onClose: () => void
}

const ROLE_LABELS: Record<WorkspaceListItemDto['role'], string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
  guest: 'ゲスト',
}

export function WorkspaceSwitcherModal({
  currentWorkspaceId,
  visible,
  onClose,
}: WorkspaceSwitcherModalProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = useSession()
  const { palette } = useAppAppearance()
  const workspacesQuery = useWorkspaceList(visible)
  const [switchingId, setSwitchingId] = React.useState<string | null>(null)
  const [switchError, setSwitchError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!visible) {
      setSwitchingId(null)
      setSwitchError(null)
    }
  }, [visible])

  const switchWorkspace = async (workspace: WorkspaceListItemDto) => {
    if (!session?.user.id || workspace.id === currentWorkspaceId) {
      onClose()
      return
    }

    setSwitchError(null)
    setSwitchingId(workspace.id)
    try {
      await setSelectedWorkspaceId(session.user.id, workspace.id)
      queryClient.setQueryData<WorkspaceDto>(['workspace'], {
        id: workspace.id,
        name: workspace.name,
        logoUrl: workspace.logoUrl,
      })
      onClose()
      await queryClient.resetQueries({
        predicate: (query) => query.queryKey[0] !== 'workspace',
      })
      router.replace('/(app)/chats')
    } catch (error) {
      setSwitchingId(null)
      setSwitchError(
        error instanceof Error ? error.message : 'ワークスペースを切り替えられませんでした',
      )
    }
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ワークスペース切替を閉じる"
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(14, insets.bottom),
              backgroundColor: palette.card,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: palette.text }]}>ワークスペース</Text>
              <Text style={[styles.subtitle, { color: palette.text3 }]}>
                表示するワークスペースを選択
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ワークスペース切替を閉じる"
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={palette.text3} />
            </Pressable>
          </View>

          {switchError ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: palette.redText }]}>
              {switchError}
            </Text>
          ) : null}

          {workspacesQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={palette.accent} />
            </View>
          ) : workspacesQuery.error ? (
            <View style={styles.center}>
              <Text style={[styles.error, { color: palette.redText }]}>
                {workspacesQuery.error.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void workspacesQuery.refetch()}
                style={[styles.retryButton, { backgroundColor: palette.accent }]}
              >
                <Text style={[styles.retryText, { color: palette.onAccent }]}>再読み込み</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={workspacesQuery.data ?? []}
              keyExtractor={(workspace) => workspace.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const selected = item.id === currentWorkspaceId
                const switching = item.id === switchingId
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: switching }}
                    disabled={switching}
                    onPress={() => void switchWorkspace(item)}
                    style={({ pressed }) => [
                      styles.workspaceRow,
                      {
                        backgroundColor: selected ? palette.accentSoft : palette.card,
                        borderColor: selected ? palette.accent : palette.border,
                        opacity: pressed ? 0.76 : 1,
                      },
                    ]}
                  >
                    {item.logoUrl ? (
                      <Image source={{ uri: item.logoUrl }} style={styles.logo} />
                    ) : (
                      <View style={[styles.logo, { backgroundColor: palette.accent }]}>
                        <Text style={[styles.logoInitial, { color: palette.onAccent }]}>
                          {item.name.slice(0, 1)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.workspaceCopy}>
                      <Text
                        style={[styles.workspaceName, { color: palette.text }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text style={[styles.role, { color: palette.text3 }]}>
                        {ROLE_LABELS[item.role]}
                      </Text>
                    </View>
                    {switching ? (
                      <ActivityIndicator size="small" color={palette.accent} />
                    ) : selected ? (
                      <Ionicons name="checkmark-circle" size={21} color={palette.accent} />
                    ) : (
                      <Ionicons name="chevron-forward" size={17} color={palette.text4} />
                    )}
                  </Pressable>
                )
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
  },
  sheet: {
    maxHeight: '68%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A1A1AA',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { marginTop: 2, fontSize: 12 },
  closeButton: { padding: 6 },
  center: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retryButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  retryText: { fontSize: 13, fontWeight: '700' },
  list: { gap: 8, paddingBottom: 8 },
  workspaceRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: { fontSize: 14, fontWeight: '800' },
  workspaceCopy: { flex: 1, minWidth: 0 },
  workspaceName: { fontSize: 14, fontWeight: '700' },
  role: { marginTop: 2, fontSize: 11 },
})
