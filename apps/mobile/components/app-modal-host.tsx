// アプリが開いたモーダル（views.open）をネイティブで出す。Web の AppModalHost と同じ流れで、
// Realtime で本人のトピックへ app_views の変化が届いたら一覧を取り直し、いちばん新しいものを出す（docs/app-platform-design.md §5.5）。
// react-native の部品だけで描き、runtimeVersion を上げずに EAS Update で配信できるようにする

import React from 'react'
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cardActionErrorMessage, normalizeModalView, viewFieldErrorMessage, type RenderInputElement, type RenderModal, type RenderModalBlock } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'
import type { ThemePalette } from '../lib/theme'
import { useAppAppearance } from './appearance-provider'
import { useT } from './locale-provider'
import { CardBlock, type CardContext } from './message-card'

type AppViewDto = { id: string; hash: string; view: unknown; appName: string; appIconUrl: string | null }
type FieldError = { code?: string; message?: string }
type Values = Record<string, Record<string, string>>

const APP_VIEWS_QUERY_KEY = ['app-views'] as const

export function AppModalHost() {
  const t = useT()
  const { palette } = useAppAppearance()
  const query = useQuery<AppViewDto[]>({
    queryKey: APP_VIEWS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/app-views')
      if (!res.ok) throw new Error(`app-views ${res.status}`)
      return res.json() as Promise<AppViewDto[]>
    },
  })
  const current = query.data?.[0]
  // 送信の前にアプリが views.update した場合、作り直したモーダルに理由を出す
  const [changedNotice, setChangedNotice] = React.useState<{ viewId: string; message: string } | null>(null)
  if (query.isError && !current) {
    // 開いたはずのモーダルを黙って出さないままにしない（Web の AppModalHost と同じ）
    return (
      <Pressable
        accessibilityRole="alert"
        onPress={() => void query.refetch()}
        style={[styles.loadError, { backgroundColor: palette.card, borderColor: palette.border }]}
      >
        <Text style={{ color: palette.redText, fontSize: 12 }}>{t('Could not load the app form. Tap to retry.')}</Text>
      </Pressable>
    )
  }
  if (!current) return null
  // 差し替え（views.update）で中身が変わったら入力状態を作り直す
  return (
    <AppModal
      key={`${current.id}:${current.hash}`}
      dto={current}
      initialFormError={changedNotice?.viewId === current.id ? changedNotice.message : null}
      onViewChanged={(message) => setChangedNotice({ viewId: current.id, message })}
    />
  )
}

function initialValues(modal: RenderModal | null): Values {
  const values: Values = {}
  for (const block of modal?.blocks ?? []) {
    if (block.type !== 'input') continue
    values[block.blockId] = { [block.element.actionId]: block.element.initialValue ?? '' }
  }
  return values
}

function AppModal({ dto, initialFormError, onViewChanged }: { dto: AppViewDto; initialFormError: string | null; onViewChanged: (message: string) => void }) {
  const t = useT()
  const { palette } = useAppAppearance()
  const queryClient = useQueryClient()
  const modal = React.useMemo(() => normalizeModalView(dto.view), [dto.view])
  const [values, setValues] = React.useState<Values>(() => initialValues(modal))
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, FieldError>>({})
  const [formError, setFormError] = React.useState<string | null>(initialFormError)
  const [submitting, setSubmitting] = React.useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: APP_VIEWS_QUERY_KEY })
  const close = async () => {
    // 送信中に閉じると、アプリの応答（入力エラー・差し替え）を受ける前にモーダルが閉じて入力も応答も失われる。
    // キャンセルボタンだけでなく Esc・背景のクリック・戻る操作もここを通るので、ここで止める
    if (submitting) return
    setFormError(null)
    try {
      const res = await apiFetch(`/api/app-views/${dto.id}/close`, { method: 'POST' })
      // すでに閉じられた・使えなくなったモーダルは、取り直せば消える
      if (!res.ok && res.status !== 404) {
        setFormError(t('Could not close the form. Please try again.'))
        return
      }
    } catch {
      setFormError(t('Could not close the form. Please try again.'))
      return
    }
    await refresh()
  }
  const submit = async () => {
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})
    try {
      const res = await apiFetch(`/api/app-views/${dto.id}/submit`, { method: 'POST', body: JSON.stringify({ hash: dto.hash, values }) })
      const body = (await res.json().catch(() => null)) as { errors?: Record<string, FieldError>; error?: string } | null
      if (res.status === 422 && body?.errors) {
        setFieldErrors(body.errors)
        return
      }
      if (!res.ok) {
        const message = t(cardActionErrorMessage(body?.error))
        if (body?.error === 'view_changed') {
          // 新しい版を取り直すとモーダルが作り直されるので、理由はホストに預ける
          onViewChanged(message)
          await refresh()
          return
        }
        setFormError(message)
        return
      }
      await refresh()
    } catch {
      setFormError(t(cardActionErrorMessage(null)))
    } finally {
      setSubmitting(false)
    }
  }

  // モーダル内のボタン（block_actions）は第1段階では押せない表示にする。リンクは外部ブラウザで開く（カードの URL は https のみ）
  const cardContext: CardContext = {
    palette,
    mentionNames: new Map(),
    onLinkPress: (url) => {
      void Linking.openURL(url)
      return false
    },
    onAction: undefined,
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => void close()}>
      <KeyboardAvoidingView style={[styles.sheet, { backgroundColor: palette.card }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: palette.divider }]}>
          <Pressable accessibilityRole="button" onPress={() => void close()} disabled={submitting} hitSlop={8}>
            <Text style={{ color: palette.text2, fontSize: 15 }}>{modal?.close ?? t('Cancel')}</Text>
          </Pressable>
          <View style={styles.titleBox}>
            <Text style={{ color: palette.text3, fontSize: 11 }} numberOfLines={1}>{dto.appName}</Text>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{modal?.title ?? dto.appName}</Text>
          </View>
          {modal?.submit ? (
            <Pressable accessibilityRole="button" onPress={() => void submit()} disabled={submitting || modal.hasUnsupported} hitSlop={8}>
              <Text style={{ color: submitting || modal.hasUnsupported ? palette.text4 : palette.accentText, fontSize: 15, fontWeight: '700' }}>
                {submitting ? t('Submitting...') : modal.submit}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!modal ? (
            <Text accessibilityRole="alert" style={{ color: palette.redText }}>{t('This form cannot be shown in this version. Update the app to see it.')}</Text>
          ) : (
            <>
              {modal.blocks.map((block) => (
                <ModalBlock
                  key={block.blockId}
                  block={block}
                  palette={palette}
                  cardContext={cardContext}
                  value={block.type === 'input' ? values[block.blockId]?.[block.element.actionId] ?? '' : ''}
                  error={fieldErrors[block.blockId]}
                  onChange={(next) => {
                    if (block.type !== 'input') return
                    setValues((prev) => ({ ...prev, [block.blockId]: { [block.element.actionId]: next } }))
                  }}
                />
              ))}
              {modal.hasUnsupported && (
                <View style={[styles.notice, { borderColor: palette.border }]}>
                  <Text style={{ color: palette.text3, fontSize: 12 }}>
                    {t('Part of this form cannot be shown in this version, so it cannot be submitted. Update the app to see it.')}
                  </Text>
                </View>
              )}
            </>
          )}
          {formError && <Text accessibilityRole="alert" style={{ color: palette.redText, fontSize: 13 }}>{formError}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function ModalBlock({
  block,
  palette,
  cardContext,
  value,
  error,
  onChange,
}: {
  block: RenderModalBlock
  palette: ThemePalette
  cardContext: CardContext
  value: string
  error: FieldError | undefined
  onChange: (value: string) => void
}) {
  const t = useT()
  if (block.type !== 'input') return <CardBlock block={block} context={cardContext} />
  return (
    <View style={styles.field}>
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
        {block.label}
        {block.optional && <Text style={{ color: palette.text3, fontSize: 12, fontWeight: '400' }}>{`  ${t('Optional')}`}</Text>}
      </Text>
      <InputElement element={block.element} palette={palette} value={value} invalid={!!error} label={block.label} onChange={onChange} />
      {block.hint && <Text style={{ color: palette.text3, fontSize: 12 }}>{block.hint}</Text>}
      {error && <Text accessibilityRole="alert" style={{ color: palette.redText, fontSize: 12 }}>{viewFieldErrorMessage(error, t)}</Text>}
    </View>
  )
}

function InputElement({
  element,
  palette,
  value,
  invalid,
  label,
  onChange,
}: {
  element: RenderInputElement
  palette: ThemePalette
  value: string
  invalid: boolean
  label: string
  onChange: (value: string) => void
}) {
  const borderColor = invalid ? palette.redText : palette.border
  if (element.type === 'static_select') {
    // 選択肢は数が少ない前提で、その場に並べて選ばせる（シートを重ねない）
    return (
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.options, { borderColor }]}>
        {element.options.map((option, index) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? '' : option.value)}
              style={[styles.option, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider }, selected && { backgroundColor: palette.accentSoft }]}
            >
              <Text style={{ color: selected ? palette.accentText : palette.text, fontSize: 15 }}>{option.text}</Text>
              {option.description && <Text style={{ color: palette.text3, fontSize: 12 }}>{option.description}</Text>}
            </Pressable>
          )
        })}
      </View>
    )
  }
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={element.placeholder}
      placeholderTextColor={palette.text4}
      multiline={element.multiline}
      {...(element.maxLength !== undefined ? { maxLength: element.maxLength } : {})}
      style={[styles.input, element.multiline && styles.multiline, { borderColor, color: palette.text, backgroundColor: palette.card }]}
    />
  )
}

const styles = StyleSheet.create({
  loadError: { position: 'absolute', left: 16, right: 16, bottom: 96, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  sheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  titleBox: { flex: 1, alignItems: 'center' },
  body: { padding: 16, gap: 16 },
  field: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  options: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  option: { paddingHorizontal: 12, paddingVertical: 12, gap: 2 },
  notice: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, padding: 8 },
})
