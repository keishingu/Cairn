import React from 'react'
import { Image, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { avatarGradient, avatarInitial } from '@cairn/shared'

// Web の Avatar と同じく、画像が未設定なら名前から決まるグラデーションと頭文字を出す
export function UserAvatar({
  name,
  url,
  size,
  style,
}: {
  name: string
  url?: string | null
  size: number
  style?: StyleProp<ViewStyle>
}) {
  const frame = { width: size, height: size, borderRadius: size / 2 }
  if (url) {
    return <Image accessibilityLabel={name} source={{ uri: url }} style={[frame, style as object]} />
  }
  const [from, to] = avatarGradient(name)
  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[frame, styles.fallback, style]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{avatarInitial(name)}</Text>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: '#FFFFFF', fontWeight: '600' },
})
