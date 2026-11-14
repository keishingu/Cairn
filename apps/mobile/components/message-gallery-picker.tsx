import React from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { API_BASE_URL } from '../lib/env'
import { attachmentRequestHeaders, type AttachmentAuth } from '../lib/attachment-auth'
import { initialGallerySelection, type MessageGalleryImage } from '../lib/message-gallery'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'

export type MessageGalleryPickerState = {
  images: MessageGalleryImage[]
  addedFileIds: string[]
}

// メッセージの画像を選んで、プロジェクトのギャラリーへまとめて追加するシート（Web の MessageGalleryDialog と同じ）。
export function MessageGalleryPickerModal({
  picker,
  auth,
  palette,
  error,
  onSubmit,
  onClose,
}: {
  /** null で閉じる */
  picker: MessageGalleryPickerState | null
  auth: AttachmentAuth | undefined
  palette: ThemePalette
  /** 追加に失敗した理由。Modal がチャット画面を覆うため、シート内に表示する */
  error?: string | null
  /** 成功したら true。失敗時は呼び出し側がエラーを表示し、シートは開いたままにする */
  onSubmit: (fileIds: string[]) => Promise<boolean>
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (picker) setSelected(initialGallerySelection(picker.images, picker.addedFileIds))
  }, [picker])

  const added = React.useMemo(() => new Set(picker?.addedFileIds ?? []), [picker])
  const fileIds = (picker?.images ?? []).filter((image) => selected.has(image.fileId)).map((image) => image.fileId)
  const canSubmit = fileIds.length > 0 && !submitting

  const toggle = (fileId: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      if (await onSubmit(fileIds)) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal transparent visible={picker !== null} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <Text style={[styles.title, { color: palette.text }]}>{t('Add to the gallery')}</Text>
          <Text style={[styles.subtitle, { color: palette.text3 }]}>
            {t('Choose the photos to add to the project gallery')}
          </Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.grid}>
            {(picker?.images ?? []).map((image) => {
              const done = added.has(image.fileId)
              const checked = selected.has(image.fileId)
              return (
                <Pressable
                  key={image.fileId}
                  accessibilityRole="checkbox"
                  accessibilityLabel={t('Select {name}', { name: image.fileName })}
                  accessibilityState={{ checked, disabled: done || submitting }}
                  disabled={done || submitting}
                  onPress={() => toggle(image.fileId)}
                  style={[
                    styles.tile,
                    { borderColor: checked ? palette.accent : palette.border, borderWidth: checked ? 2 : 1 },
                  ]}
                >
                  {auth ? (
                    <Image
                      source={{
                        uri: `${API_BASE_URL}/api/attachments/${image.fileId}?thumb=1`,
                        headers: attachmentRequestHeaders(auth),
                      }}
                      style={[styles.thumb, { opacity: done ? 0.45 : 1 }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: palette.card2 }]} />
                  )}
                  <View style={styles.check}>
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={done ? palette.text4 : checked ? palette.accent : '#fff'}
                    />
                  </View>
                  {done && (
                    <Text style={[styles.done, { backgroundColor: palette.card, color: palette.text3 }]}>
                      {t('Added')}
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: palette.redText }]}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={[styles.submit, { backgroundColor: palette.accent, opacity: canSubmit ? 1 : 0.45 }]}
          >
            {submitting ? (
              <ActivityIndicator color={palette.onAccent} />
            ) : (
              <Text style={[styles.submitText, { color: palette.onAccent }]}>
                {t('Add {count} photos', { count: fileIds.length })}
              </Text>
            )}
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 2 },
  list: { marginTop: 12, flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  tile: { width: '31%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  check: { position: 'absolute', top: 4, left: 4 },
  done: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 4,
    paddingVertical: 2,
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },
  error: { fontSize: 13, marginTop: 8 },
  submit: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700' },
})
