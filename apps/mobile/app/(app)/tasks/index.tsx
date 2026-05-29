import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useTasks, useUpdateTaskStatus } from '../../../hooks/use-tasks'
import type { TaskDto } from '../../../hooks/use-tasks'

const STATUS_LABEL: Record<TaskDto['status'], string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
}
const STATUS_NEXT: Record<TaskDto['status'], TaskDto['status']> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}
const STATUS_COLOR: Record<TaskDto['status'], string> = {
  todo: '#9ca3af',
  in_progress: '#0070f3',
  done: '#16a34a',
}
const PRIORITY_LABEL: Record<TaskDto['priority'], string> = { high: '高', medium: '中', low: '低' }
const PRIORITY_COLOR: Record<TaskDto['priority'], string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#6b7280',
}

function TaskItem({ task }: { task: TaskDto }) {
  const update = useUpdateTaskStatus()
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <TouchableOpacity
          style={[styles.statusBadge, { borderColor: STATUS_COLOR[task.status] }]}
          onPress={() => update.mutate({ id: task.id, status: STATUS_NEXT[task.status] })}
          disabled={update.isPending}
        >
          <Text style={[styles.statusText, { color: STATUS_COLOR[task.status] }]}>
            {STATUS_LABEL[task.status]}
          </Text>
        </TouchableOpacity>
        <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[task.priority] }]} />
        <Text style={styles.priorityText}>{PRIORITY_LABEL[task.priority]}</Text>
      </View>
      <Text style={[styles.title, task.status === 'done' && styles.doneTitle]}>{task.title}</Text>
      <Text style={styles.meta}>
        {task.projectTitle}
        {task.dueDate ? ` · 期限: ${new Date(task.dueDate).toLocaleDateString('ja-JP')}` : ''}
        {task.assigneeName ? ` · ${task.assigneeName}` : ''}
      </Text>
    </View>
  )
}

export default function TasksScreen() {
  const { data: tasks, isLoading, error } = useTasks()

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.errorText}>{error.message}</Text></View>
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>タスク</Text>
      <FlatList
        data={tasks}
        keyExtractor={t => t.id}
        renderItem={({ item }) => <TaskItem task={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>タスクがありません</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  heading: { fontSize: 22, fontWeight: '700', padding: 16, paddingBottom: 8 },
  list: { padding: 12, gap: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e8e8e8' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 12, fontWeight: '500' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityText: { fontSize: 12, color: '#666' },
  title: { fontSize: 15, fontWeight: '500', color: '#111', marginBottom: 4 },
  doneTitle: { textDecorationLine: 'line-through', color: '#999' },
  meta: { fontSize: 12, color: '#888' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48 },
})
