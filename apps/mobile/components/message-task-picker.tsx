import React from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'
import {
  initialMessageTaskRows,
  isValidTaskTitle,
  selectedTaskItems,
  type MessageTaskCandidate,
  type MessageTaskSubmitItem,
  type MessageTaskRow,
} from '../lib/message-task'

type LinkedTask = { id: string; title: string; status: 'todo' | 'in_progress' | 'done' }

// メッセージの行を選んでまとめてタスクにするシート。タイトルはその場で編集できる。
export function MessageTaskPickerModal({
  candidates,
  palette,
  error,
  onSubmit,
  onClose,
}: {
  /** null で閉じる */
  candidates: MessageTaskCandidate[] | null
  /** 作成に失敗した理由。Modal がチャット画面を覆うため、シート内に表示する */
  error?: string | null
  palette: ThemePalette
  /** 成功したら true。失敗時は呼び出し側がエラーを表示し、シートは開いたままにする */
  onSubmit: (items: MessageTaskSubmitItem[]) => Promise<boolean>
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const [rows, setRows] = React.useState<MessageTaskRow[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (candidates) setRows(initialMessageTaskRows(candidates))
  }, [candidates])

  const items = selectedTaskItems(rows)
  const hasInvalid = rows.some((row) => row.selected && !isValidTaskTitle(row.title))
  const canSubmit = items.length > 0 && !hasInvalid && !submitting

  const update = (index: number, patch: Partial<MessageTaskRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      if (await onSubmit(items)) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal transparent visible={candidates !== null} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={[styles.title, { color: palette.text }]}>{t('Make tasks from this message')}</Text>
        <Text style={[styles.subtitle, { color: palette.text3 }]}>{t('Choose the lines to add as tasks')}</Text>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
          {rows.map((row, index) => {
            const done = row.taskId != null
            const invalid = row.selected && !isValidTaskTitle(row.title)
            return (
              <View key={index} style={styles.row}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={t('Select this line')}
                  accessibilityState={{ checked: row.selected, disabled: done || submitting }}
                  disabled={done || submitting}
                  hitSlop={8}
                  onPress={() => update(index, { selected: !row.selected })}
                >
                  <Ionicons
                    name={row.selected ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={done ? palette.text4 : row.selected ? palette.accent : palette.text3}
                  />
                </Pressable>
                <TextInput
                  accessibilityLabel={t('Task title')}
                  value={row.title}
                  editable={!done && !submitting}
                  onChangeText={(value) => update(index, { title: value })}
                  style={[
                    styles.input,
                    {
                      borderColor: invalid ? palette.redText : palette.border,
                      backgroundColor: done ? palette.card2 : palette.card,
                      color: done ? palette.text3 : palette.text,
                    },
                  ]}
                />
                {done && <Text style={[styles.done, { color: palette.text3 }]}>{t('Already a task')}</Text>}
              </View>
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
              {t('Make {count} tasks', { count: items.length })}
            </Text>
          )}
        </Pressable>
      </View>
    </Modal>
  )
}

// 複数のタスクがあるメッセージで、チップから開くタスク一覧。選ぶとそのタスクを開く。
export function LinkedTasksModal({
  tasks,
  palette,
  onSelect,
  onClose,
}: {
  /** null で閉じる */
  tasks: LinkedTask[] | null
  palette: ThemePalette
  onSelect: (taskId: string) => void
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const statusLabel = (status: LinkedTask['status']) =>
    status === 'done' ? t('Done') : status === 'in_progress' ? t('In progress') : t('Not started')

  return (
    <Modal transparent visible={tasks !== null} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={[styles.title, { color: palette.text }]}>{t('Show tasks')}</Text>
        <ScrollView style={styles.list}>
          {(tasks ?? []).map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => onSelect(task.id)}
              style={({ pressed }) => [styles.taskRow, { borderTopColor: palette.divider, opacity: pressed ? 0.65 : 1 }]}
            >
              <Ionicons
                name={task.status === 'done' ? 'checkbox' : 'checkbox-outline'}
                size={20}
                color={task.status === 'done' ? palette.text3 : palette.accentText}
              />
              <Text numberOfLines={2} style={[styles.taskTitle, { color: palette.text }]}>{task.title}</Text>
              <Text style={[styles.done, { color: palette.text3 }]}>{statusLabel(task.status)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  error: { fontSize: 13, marginTop: 8 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 14 },
  done: { fontSize: 11.5, fontWeight: '600' },
  submit: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700' },
  taskRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  taskTitle: { flex: 1, fontSize: 14 },
})
