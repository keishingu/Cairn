import React from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shareCachedAttachment } from '../lib/attachment-cache'

export function ChatImageViewer({
  fileUrl,
  fileId,
  fileName,
  mimeType,
  accessToken,
  onClose,
}: {
  fileUrl: string
  fileId: string
  fileName: string
  mimeType: string | null
  accessToken: string
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [attempt, setAttempt] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [busyAction, setBusyAction] = React.useState<'save' | 'share' | null>(null)

  const runFileAction = async (action: 'save' | 'share') => {
    if (busyAction) return
    setBusyAction(action)
    try {
      await shareCachedAttachment({
        fileUrl,
        fileId,
        fileName,
        accessToken,
        mimeType,
        dialogTitle: action === 'save' ? '画像を保存' : '画像を共有',
      })
    } catch (error) {
      Alert.alert(
        action === 'save' ? '画像を保存できませんでした' : '画像を共有できませんでした',
        error instanceof Error ? error.message : 'しばらくしてから再度お試しください。',
      )
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="画像を閉じる"
            onPress={onClose}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>

        <View style={styles.stage}>
          {failed ? (
            <View style={styles.failure}>
              <Text style={styles.failureText}>画像を表示できませんでした</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="画像を再読み込み"
                onPress={() => {
                  setFailed(false)
                  setLoading(true)
                  setAttempt((current) => current + 1)
                }}
                style={styles.retry}
              >
                <Text style={styles.retryText}>再試行</Text>
              </Pressable>
            </View>
          ) : (
            <Image
              key={attempt}
              accessibilityLabel={fileName}
              source={{
                uri: fileUrl,
                headers: { Authorization: `Bearer ${accessToken}` },
              }}
              resizeMode="contain"
              style={StyleSheet.absoluteFill}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setFailed(true)
              }}
            />
          )}
          {loading && !failed && (
            <ActivityIndicator style={styles.spinner} size="large" color="#FFFFFF" />
          )}
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          <ViewerAction
            icon="download-outline"
            label="保存"
            busy={busyAction === 'save'}
            disabled={busyAction !== null}
            onPress={() => void runFileAction('save')}
          />
          <ViewerAction
            icon="share-outline"
            label="共有"
            busy={busyAction === 'share'}
            disabled={busyAction !== null}
            onPress={() => void runFileAction('share')}
          />
        </View>
      </View>
    </Modal>
  )
}

function ViewerAction({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  busy: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      )}
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  fileName: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spinner: { position: 'absolute' },
  failure: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  failureText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retry: {
    minHeight: 36,
    borderRadius: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
})
