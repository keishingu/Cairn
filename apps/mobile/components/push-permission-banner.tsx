import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { usePushPermission } from '../hooks/use-push-permission'
import { useAppAppearance } from './appearance-provider'
import { useT } from './locale-provider'

/**
 * 通知一覧の上に、この端末のプッシュ通知のオン/オフを出す（Web の通知ページのスイッチに相当）。
 * オンは OS の許可（無ければ許可ダイアログ、出せなければ設定アプリ）を経て登録し、オフは登録を外す
 */
export function PushPermissionBanner() {
  const t = useT()
  const { palette } = useAppAppearance()
  const { state, busy, turnOn, turnOff, retry } = usePushPermission()

  if (state.status === 'unsupported' || state.status === 'loading') return null

  const on = state.status === 'granted' && state.enabled
  const message =
    state.status === 'error'
      ? { text: t('Could not check notification permission'), error: true }
      : state.syncFailed === 'register'
        ? { text: `${t('Could not register this device for push notifications')} ${t('Check your connection and try again.')}`, error: true }
        : state.syncFailed === 'unregister'
          ? { text: `${t('Could not turn off push notifications for this device')} ${t('Check your connection and try again.')}`, error: true }
          : state.status === 'open-settings'
            ? { text: t('Notifications are blocked. Turning this on opens the Settings app.'), error: false }
            : null

  return (
    <View style={[styles.container, { borderBottomColor: palette.border }]}>
      <View style={styles.row}>
        <Ionicons name={on ? 'notifications' : 'notifications-off-outline'} size={16} color={on ? palette.accentText : palette.text3} />
        <Text style={[styles.label, { color: palette.text2 }]}>{t('Push notifications')}</Text>
        {busy ? <ActivityIndicator size="small" color={palette.accent} /> : null}
        <Switch
          accessibilityLabel={on ? t('Turn off push notifications') : t('Turn on push notifications')}
          value={on}
          disabled={busy || state.status === 'error'}
          onValueChange={(next) => void (next ? turnOn() : turnOff())}
          trackColor={{ true: palette.accent }}
        />
      </View>
      {message ? (
        <View style={styles.messageRow}>
          <Text style={[styles.message, { color: message.error ? palette.redText : palette.text3 }]}>{message.text}</Text>
          {message.error ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void retry()}
              style={({ pressed }) => [styles.retryButton, { backgroundColor: palette.accentSoft }, pressed && styles.pressed]}
            >
              <Text style={[styles.retryText, { color: palette.accentText }]}>{t('Retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 14, fontWeight: '600' },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  message: { flex: 1, fontSize: 12, lineHeight: 17 },
  retryButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.85 },
})
