import React from 'react'
import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, View } from 'react-native'
import { useRouter } from 'expo-router'
import { FontAwesome } from '@expo/vector-icons'
import { signInWithGoogle } from '../lib/oauth'
import { completePostAuthNavigation } from '../lib/auth-navigation'

interface Props {
  label: string
  onError: (message: string) => void
}

export function GoogleSignInButton({ label, onError }: Props) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)

  async function handlePress() {
    setLoading(true)
    onError('')
    try {
      const result = await signInWithGoogle()
      if (result === 'needs-workspace') router.replace('/onboarding')
      else if (result === 'success') router.replace('/(app)/projects')
      // 成功時は _layout.tsx の onAuthStateChange が遷移する
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Google ログインに失敗しました')
    } finally {
      completePostAuthNavigation()
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
