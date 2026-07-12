import { useRouter } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

const MENU_ITEMS = [
  { label: 'ファイル', route: '/(app)/files' },
  { label: 'ギャラリー', route: '/(app)/gallery' },
  { label: 'メンバー', route: '/(app)/members' },
  { label: '設定', route: '/(app)/settings' },
] as const

export default function MenuScreen() {
  const router = useRouter()

  function handleSignOut() {
    router.push('/(app)/signout')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>メニュー</Text>
      <View style={styles.section}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity key={item.route} style={styles.menuButton} onPress={() => router.push(item.route)}>
            <Text style={styles.menuLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>サインアウト</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 24 },
  section: { gap: 12, marginBottom: 24 },
  menuButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLabel: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  signOutButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#b91c1c', fontWeight: '600', fontSize: 15 },
})
