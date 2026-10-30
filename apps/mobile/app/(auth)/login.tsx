import React from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { useT } from '../../components/locale-provider'
import { AUTH_BUTTON_BACKGROUND, AUTH_PALETTE as palette } from '../../lib/auth-palette'
import { supabase } from '../../lib/supabase'
import { GoogleSignInButton } from '../../components/google-sign-in-button'
import { AppleSignInButton } from '../../components/apple-sign-in-button'
import * as AppleAuthentication from 'expo-apple-authentication'

export default function LoginScreen() {
  const t = useT()
  const { accountDeleted } = useLocalSearchParams<{ accountDeleted?: string }>()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleLogin() {
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    }
    // 成功時は _layout.tsx の onAuthStateChange が /(app)/chats へリダイレクト
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cairn</Text>
      <Text style={styles.subtitle}>{t('Sign in')}</Text>

      <View style={styles.form}>
        {accountDeleted === '1' && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{t('Your account has been deleted.')}</Text>
          </View>
        )}
        <TextInput
          style={styles.input}
          placeholderTextColor={palette.text3}
          placeholder={t('Email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholderTextColor={palette.text3}
          placeholder={t('Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={palette.onAccent} />
          ) : <Text style={styles.buttonText}>{t('Sign in')}</Text>}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('or')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <GoogleSignInButton label={t('Sign in with Google')} onError={(m) => setError(m || null)} />
        <AppleSignInButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          onError={(m) => setError(m || null)}
        />
      </View>

      <Link href="/(auth)/signup" style={styles.link}>
        {t("Don't have an account? Sign up")}
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: palette.bg,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
    color: palette.text,
  },
  subtitle: {
    fontSize: 16,
    color: palette.text3,
    marginBottom: 32,
  },
  form: {
    width: '100%',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: palette.text,
    backgroundColor: palette.card,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  successBox: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    borderRadius: 8,
    padding: 12,
  },
  successText: {
    color: '#047857',
    fontSize: 14,
  },
  button: {
    backgroundColor: AUTH_BUTTON_BACKGROUND,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: palette.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border,
  },
  dividerText: {
    color: palette.text4,
    fontSize: 13,
  },
  link: {
    marginTop: 24,
    color: palette.accentText,
    fontSize: 14,
  },
})
