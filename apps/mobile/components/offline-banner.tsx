import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatLastSynced } from '../lib/offline-cache'
import { useAppAppearance } from './appearance-provider'
import { useT } from './locale-provider'

/** 圏外・取得失敗で古いデータを見せている間、一覧の上に出す */
export function OfflineBanner({
  syncedAt,
  retrying,
  onRetry,
}: {
  syncedAt: number
  retrying: boolean
  onRetry: () => void
}) {
  const t = useT()
  const { palette } = useAppAppearance()
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: palette.card2, borderBottomColor: palette.border }]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={palette.text3} />
      <Text style={[styles.text, { color: palette.text3 }]} numberOfLines={2}>
        {t('Offline · Last synced {time}', { time: formatLastSynced(syncedAt) })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Retry')}
        disabled={retrying}
        onPress={onRetry}
        hitSlop={6}
      >
        {retrying ? (
          <ActivityIndicator size="small" color={palette.text3} />
        ) : (
          <Text style={[styles.action, { color: palette.accentText }]}>{t('Retry')}</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  text: { flex: 1, fontSize: 12, lineHeight: 16 },
  action: { fontSize: 12, fontWeight: '700' },
})
