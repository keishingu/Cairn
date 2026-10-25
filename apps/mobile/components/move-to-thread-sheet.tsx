import React from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useKeyboardVisible } from '../hooks/use-keyboard-visible'
import {
  WORKSPACE_CHANNEL_NAME_MAX,
  defaultThreadNameFromMessage,
  workspaceChannelDisplayName,
} from '@cairn/shared'
import type { MoveToThreadBody } from '@cairn/shared'
import { useT } from './locale-provider'
import { buildMoveBody, type MoveScope } from '../lib/move-to-thread'
import type { ThemePalette } from '../lib/theme'

export interface MoveToThreadSheetThread {
  id: string
  name: string | null
}

interface Props {
  /** 切り出しの起点にしたメッセージ。null のときは閉じる */
  message: { id: string; content: string } | null
  threads: ReadonlyArray<MoveToThreadSheetThread>
  palette: ThemePalette
  pending: boolean
  /** 直前の切り出しで失敗した理由 */
  error: string | null
  onSubmit: (body: MoveToThreadBody) => void
  onClose: () => void
}

/** 親チャンネルのメッセージをスレッドへ切り出す下シート（範囲: このメッセージだけ / 以降すべて）。 */
export function MoveToThreadSheet({ message, threads, palette, pending, error, onSubmit, onClose }: Props) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardVisible()
  const [scope, setScope] = React.useState<MoveScope>('after')
  const [destination, setDestination] = React.useState<'new' | 'existing'>('new')
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [validation, setValidation] = React.useState<string | null>(null)
  const messageId = message?.id ?? null
  const messageContent = message?.content ?? ''

  // 開くたびに初期状態へ戻し、スレッド名は先頭メッセージの本文から作る
  React.useEffect(() => {
    if (!messageId) return
    setScope('after')
    setDestination('new')
    setThreadId(null)
    setName(defaultThreadNameFromMessage(messageContent))
    setValidation(null)
  }, [messageId, messageContent])

  const submit = () => {
    if (!message || pending) return
    const trimmed = name.trim()
    if (destination === 'new') {
      if (!trimmed) { setValidation(t('Enter a thread name')); return }
      if (Array.from(trimmed).length > WORKSPACE_CHANNEL_NAME_MAX) { setValidation(t('Enter 60 characters or fewer')); return }
    } else if (!threadId) {
      setValidation(t('Choose a thread'))
      return
    }
    setValidation(null)
    onSubmit(buildMoveBody(scope, message.id, destination === 'new' ? { kind: 'new', name: trimmed } : { kind: 'existing', threadId: threadId! }))
  }

  const row = (selected: boolean, label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.row,
        { borderColor: selected ? palette.accent : palette.border, backgroundColor: selected ? palette.accentSoft : 'transparent' },
      ]}
    >
      <View style={[styles.radio, { borderColor: selected ? palette.accent : palette.text4 }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: palette.accent }]} />}
      </View>
      <Text style={[styles.rowLabel, { color: palette.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )

  const feedback = error ?? validation

  return (
    <Modal transparent visible={message !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={pending ? undefined : onClose} />
      <KeyboardAvoidingView
        behavior="padding"
        pointerEvents="box-none"
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 }]}>
          <Text style={[styles.title, { color: palette.text }]}>{t('Move to thread')}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
            <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{t('Messages to move')}</Text>
            {row(scope === 'single', t('This message only'), () => setScope('single'))}
            {row(scope === 'after', t('This message and everything after'), () => setScope('after'))}

            <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{t('Destination')}</Text>
            {row(destination === 'new', t('New thread'), () => { setDestination('new'); setValidation(null) })}
            {row(destination === 'existing', t('Existing thread'), () => { setDestination('existing'); setValidation(null) })}

            {destination === 'new' ? (
              <>
                <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{t('Thread name')}</Text>
                <TextInput
                  value={name}
                  onChangeText={(value) => { setName(value); setValidation(null) }}
                  maxLength={WORKSPACE_CHANNEL_NAME_MAX}
                  placeholder={t('e.g. Release prep')}
                  placeholderTextColor={palette.text4}
                  accessibilityLabel={t('Thread name')}
                  style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card2 }]}
                />
              </>
            ) : threads.length === 0 ? (
              <Text style={[styles.empty, { color: palette.text3 }]}>{t('No threads to move to yet')}</Text>
            ) : (
              threads.map((thread) =>
                row(threadId === thread.id, workspaceChannelDisplayName(thread.name, true), () => { setThreadId(thread.id); setValidation(null) }),
              )
            )}
            {feedback && <Text style={[styles.error, { color: palette.redText }]}>{feedback}</Text>}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onClose} disabled={pending} style={[styles.button, { borderColor: palette.border }]}>
              <Text style={[styles.buttonLabel, { color: palette.text }]}>{t('Cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={submit}
              disabled={pending || (destination === 'existing' && threads.length === 0)}
              style={[styles.button, styles.primary, { backgroundColor: palette.accent, borderColor: palette.accent, opacity: pending ? 0.6 : 1 }]}
            >
              <Text style={[styles.buttonLabel, { color: palette.onAccent }]}>{pending ? t('Moving...') : t('Move')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  body: { flexGrow: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, marginBottom: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { flex: 1, fontSize: 14 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  empty: { fontSize: 13, paddingVertical: 8 },
  error: { fontSize: 12.5, marginTop: 10 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  button: { minHeight: 44, minWidth: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16 },
  primary: {},
  buttonLabel: { fontSize: 14, fontWeight: '600' },
})
