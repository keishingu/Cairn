import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useProjects } from '../../../hooks/use-projects'
import type { ProjectDto } from '../../../hooks/use-projects'

const STATUS_LABEL: Record<ProjectDto['statusName'], string> = {
  plan: '計画中',
  review: 'レビュー中',
  active: '進行中',
  done: '完了',
}

function ProjectCard({ project, onPress }: { project: ProjectDto; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>{project.title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{STATUS_LABEL[project.statusName]}</Text>
        </View>
      </View>
      <Text style={styles.meta}>
        メンバー {project.memberCount}人 · タスク {project.completedTaskCount}/{project.taskCount}
      </Text>
    </TouchableOpacity>
  )
}

export default function ProjectsScreen() {
  const router = useRouter()
  const { data: projects, isLoading, error } = useProjects()

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.errorText}>{error.message}</Text></View>
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>プロジェクト</Text>
      <FlatList
        data={projects}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <ProjectCard
            project={item}
            onPress={() => router.push(`/projects/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>プロジェクトがありません</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  heading: { fontSize: 22, fontWeight: '700', padding: 16, paddingBottom: 8 },
  list: { padding: 12, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { backgroundColor: '#e8f0fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, color: '#1a56db', fontWeight: '500' },
  meta: { fontSize: 13, color: '#666' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48 },
})
