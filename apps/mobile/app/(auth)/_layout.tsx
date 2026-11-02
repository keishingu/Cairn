import { StatusBar } from 'react-native'
import { Stack } from 'expo-router'
import { AUTH_PALETTE, AUTH_THEME } from '../../lib/auth-palette'

export default function AuthLayout() {
  return (
    <>
      <StatusBar barStyle={AUTH_THEME === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: AUTH_PALETTE.bg } }} />
    </>
  )
}
