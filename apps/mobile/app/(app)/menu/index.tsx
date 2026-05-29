import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { supabase } from '../../../lib/supabase'

export default function MenuScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>メニュー</Text>
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>サインアウト</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 24 },
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
