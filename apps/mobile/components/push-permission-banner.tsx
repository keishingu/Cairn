import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { usePushPermission } from '../hooks/use-push-permission'
import { useAppAppearance } from './appearance-provider'
import { useT } from './locale-provider'

/** 通知一覧の上に、端末のプッシュ通知の許可状態と、オフなら有効化の導線を出す */
export function PushPermissionBanner() {
  const t = useT()
  const { palette } = useAppAppearance()
  const { state, requesting, request, openSettings, retry } = usePushPermission()

  if (state.status === 'unsupported' || state.status === 'loading') return null

  if (state.status === 'granted' && !state.registerFailed) {
    return (
      <View style={[styles.statusRow, { borderBottomColor: palette.border }]}>
        <Ionicons name="notifications" size={14} color={palette.accentText} />
        <Text style={[styles.statusText, { color: palette.text3 }]}>{t('Push notifications are on')}</Text>
      </View>
    )
  }

  const content =
    state.status === 'error'
      ? {
          title: t('Could not check notification permission'),
          body: null,
          action: t('Retry'),
          onPress: () => void retry(),
        }
      : state.status === 'granted'
        ? {
            title: t('Could not register this device for push notifications'),
            body: t('Check your connection and try again.'),
            action: t('Retry'),
            onPress: () => void retry(),
          }
        : state.status === 'request'
          ? {
              title: t('Push notifications are off'),
              body: t('Turn them on to get mentions and updates even when the app is closed.'),
              action: t('Turn on notifications'),
              onPress: () => void request(),
            }
          : {
              title: t('Push notifications are blocked'),
              body: t('Allow notifications for this app in the Settings app.'),
              action: t('Open Settings'),
              onPress: openSettings,
            }

  return (
    <View style={[styles.banner, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.bannerText}>
        <Text style={[styles.title, { color: palette.text }]}>{content.title}</Text>
        {content.body ? <Text style={[styles.body, { color: palette.text3 }]}>{content.body}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={requesting}
        onPress={content.onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: palette.accent },
          pressed && styles.pressed,
        ]}
      >
        {requesting ? (
          <ActivityIndicator size="small" color={palette.onAccent} />
        ) : (
          <Text style={[styles.buttonText, { color: palette.onAccent }]}>{content.action}</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusText: { fontSize: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerText: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18 },
  button: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  buttonText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.85 },
})
