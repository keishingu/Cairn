import { View, Text, StyleSheet } from 'react-native'

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>通知一覧（Session 2 で実装）</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#666' },
})
