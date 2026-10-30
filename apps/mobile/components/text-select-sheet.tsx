import React from 'react'
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from './locale-provider'
import type { ThemePalette } from '../lib/theme'

interface Props {
  /** 選択対象の本文（メンションは表示名へ変換済み）。null のときは閉じる */
  text: string | null
  palette: ThemePalette
  onClose: () => void
}

/**
 * メッセージの一部だけを選んでコピーするための全画面表示。
 * チャット本文は selectable={false} のため、読み取り専用のテキストを別画面で出し、OS のコピーメニューを使う。
 * iOS は Text だと一部の RN で全選択しかできないため、読み取り専用の複数行 TextInput を使う。
 * Android は editable={false} の TextInput で選択できない場合があるため、selectable な Text を使う。
 */
export function TextSelectSheet({ text, palette, onClose }: Props) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const body = text ?? ''
  const bodyStyle = [styles.body, { color: palette.text }]

  return (
    <Modal
      visible={text !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {t('Select text')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            onPress={onClose}
            hitSlop={8}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={palette.text} />
          </Pressable>
        </View>
        {Platform.OS === 'ios' ? (
          <TextInput
            multiline
            editable={false}
            scrollEnabled
            value={body}
            accessibilityLabel={t('Select text')}
            style={[bodyStyle, styles.input]}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text selectable style={bodyStyle}>{body}</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 16, lineHeight: 24 },
  input: { flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, textAlignVertical: 'top' },
  scrollContent: { padding: 16 },
})
