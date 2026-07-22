import React from 'react'
import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, View } from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { signInWithGoogle } from '../lib/oauth'

interface Props {
  label: string
  onError: (message: string) => void
}

export function GoogleSignInButton({ label, onError }: Props) {
  const [loading, setLoading] = React.useState(false)

  async function handlePress() {
    setLoading(true)
    onError('')
    try {
      await signInWithGoogle()
      // 成功時は _layout.tsx の onAuthStateChange が遷移する
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Google ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <TouchableOpacity style={styles.button} onPress={handlePress} disabled={loading}>
      {loading ? (
        <ActivityIndicator color="#3c4043" />
      ) : (
        <View style={styles.content}>
          <FontAwesome name="google" size={18} color="#4285F4" />
          <Text style={styles.text}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    color: '#3c4043',
    fontSize: 16,
    fontWeight: '600',
  },
})
