import React from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatTaskTitleForDisplay } from '@cairn/shared'
import { useChannelMembers, useProjectMembers, type ChannelMemberDto } from '../hooks/use-chat-channels'
import { useChatInfoFiles, useChatInfoTasks, type ChatInfoFileDto } from '../hooks/use-chat-info'
import { useProjects } from '../hooks/use-projects'
import {
  chatInfoKind,
  chatInfoMemberLabel,
  formatFileSize,
  formatFileTimestamp,
  formatProjectDateRange,
  isHexColor,
  sortTasksForChecklist,
} from '../lib/chat-info'
import { isImageMime } from '../lib/attachment-file'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'
import { UserAvatar } from './user-avatar'

const VISIBLE_TASKS = 5
const VISIBLE_FILES = 3
const DESCRIPTION_LINES = 5
const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.86, 360)
const SLIDE_MS = 200

type Translate = ReturnType<typeof useT>

// 右からスライドインするチャット情報。表示はネイティブで行い、タスクの完了・追加やファイル名の変更など
// 編集は既存の Web パネル（onOpenActions）に任せる
export function ChatInfoDrawer({
  channelId,
  channelName,
  channelType,
  projectId,
  isPrivate,
  palette,
  onClose,
  onOpenActions,
  onOpenProject,
  onOpenFile,
  onOpenMember,
}: {
  channelId: string
  channelName: string
  channelType: string | undefined
  projectId: string | undefined
  isPrivate: boolean
  palette: ThemePalette
  onClose: () => void
  onOpenActions: () => void
  onOpenProject: (projectId: string) => void
  onOpenFile: (file: ChatInfoFileDto) => void
  onOpenMember: (member: ChannelMemberDto) => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const kind = chatInfoKind(channelType, projectId)
  const [visible, setVisible] = React.useState(true)
  const progress = React.useRef(new Animated.Value(0)).current
  const afterCloseRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: SLIDE_MS, useNativeDriver: true }).start()
  }, [progress])

  const finishClose = () => {
    const after = afterCloseRef.current
    afterCloseRef.current = null
    onClose()
    after?.()
  }

  // 閉じかけの Modal の上に次の画面を出すと一緒に閉じられるため、閉じきってから開く。onDismiss は iOS でしか呼ばれない
  const close = (after?: () => void) => {
    afterCloseRef.current = after ?? null
    Animated.timing(progress, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start(() => {
      setVisible(false)
      if (Platform.OS !== 'ios') finishClose()
    })
  }

  const title = t(
    kind === 'project' ? 'About this project' : kind === 'dm' ? 'Direct messages' : 'About this channel',
  )

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={() => close()} onDismiss={finishClose}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          onPress={() => close()}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: palette.card,
            borderLeftColor: palette.border,
            transform: [
              {
                translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_WIDTH, 0] }),
              },
            ],
          },
        ]}
      >
        <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: palette.divider }]}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            onPress={() => close()}
            style={[styles.closeButton, { backgroundColor: palette.card2 }]}
          >
            <Ionicons name="close" size={18} color={palette.text3} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
          {kind === 'project' && projectId ? (
            <ProjectSection
              projectId={projectId}
              channelName={channelName}
              palette={palette}
              t={t}
              onOpenProject={() => close(() => onOpenProject(projectId))}
            />
          ) : (
            <ChannelHeading
              kind={kind}
              channelName={channelName}
              isPrivate={isPrivate}
              palette={palette}
              t={t}
              onInvite={() => close(onOpenActions)}
            />
          )}
          {kind !== 'dm' && (
            <TasksSection
              scope={kind === 'project' && projectId ? { projectId } : { channelId }}
              palette={palette}
              t={t}
              onOpenActions={() => close(onOpenActions)}
            />
          )}
          <FilesSection
            channelId={channelId}
            palette={palette}
            t={t}
            onOpenFile={(file) => {
              if (file.fileType === 'link' && file.externalUrl) {
                void Linking.openURL(file.externalUrl)
                return
              }
              close(() => onOpenFile(file))
            }}
          />
          <MembersSection
            channelId={channelId}
            projectId={kind === 'project' ? projectId : undefined}
            label={chatInfoMemberLabel(kind, isPrivate, t)}
            palette={palette}
            t={t}
            onOpenMember={(member) => close(() => onOpenMember(member))}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => close(onOpenActions)}
            style={styles.moreActions}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={palette.text3} />
            <Text style={[styles.moreActionsText, { color: palette.text2 }]}>{t('More actions')}</Text>
            <Ionicons name="chevron-forward" size={16} color={palette.text4} />
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

function ChannelHeading({
  kind,
  channelName,
  isPrivate,
  palette,
  t,
  onInvite,
}: {
  kind: 'dm' | 'channel' | 'project'
  channelName: string
  isPrivate: boolean
  palette: ThemePalette
  t: Translate
  onInvite: () => void
}) {
  return (
    <View style={[styles.section, { borderBottomColor: palette.divider }]}>
      <View style={styles.headingRow}>
        {isPrivate || kind === 'dm' ? (
          <Ionicons name={isPrivate ? 'lock-closed' : 'person'} size={15} color={palette.text3} />
        ) : (
          <Text style={[styles.hash, { color: palette.text3 }]}>#</Text>
        )}
        <Text style={[styles.headingName, { color: palette.text }]} numberOfLines={2}>
          {channelName}
        </Text>
      </View>
      {isPrivate && kind === 'channel' && (
        <>
          <Text style={[styles.note, { color: palette.text3 }]}>{t('Only invited members can view this')}</Text>
          <ActionButton icon="person-add-outline" label={t('Invite members')} palette={palette} onPress={onInvite} />
        </>
      )}
    </View>
  )
}

function ProjectSection({
  projectId,
  channelName,
  palette,
  t,
  onOpenProject,
}: {
  projectId: string
  channelName: string
  palette: ThemePalette
  t: Translate
  onOpenProject: () => void
}) {
  const projects = useProjects()
  const project = projects.data?.find((candidate) => candidate.id === projectId)
  const dateRange = project ? formatProjectDateRange(project.startDate, project.endDate, t) : null
  const statusColor = isHexColor(project?.statusColor) ? project.statusColor : palette.text3
  return (
    <View style={[styles.section, { borderBottomColor: palette.divider }]}>
      <Text style={[styles.headingName, { color: palette.text }]}>{channelName}</Text>
      {dateRange && <Text style={[styles.meta, { color: palette.text3 }]}>{dateRange}</Text>}
      <Text style={[styles.meta, { color: palette.text4 }]}>{t('Project channel')}</Text>
      <ActionButton icon="arrow-forward" label={t('Open project')} palette={palette} onPress={onOpenProject} />
      {projects.isError && (
        <Text style={[styles.stateText, { color: palette.redText }]}>{projects.error.message}</Text>
      )}
      {project?.statusName && (
        <View style={[styles.statusChip, { backgroundColor: `${statusColor}22` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: palette.text }]}>{project.statusName}</Text>
        </View>
      )}
      {project?.description && <ExpandableDescription text={project.description} palette={palette} t={t} />}
    </View>
  )
}

function ExpandableDescription({ text, palette, t }: { text: string; palette: ThemePalette; t: Translate }) {
  const [expanded, setExpanded] = React.useState(false)
  const [clamped, setClamped] = React.useState(false)
  return (
    <View style={styles.description}>
      {/* 全文の行数を測る。表示側は行数を制限するので、切り詰められたかはこちらで判定する */}
      <Text
        style={[styles.descriptionText, styles.measure]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(event) => setClamped(event.nativeEvent.lines.length > DESCRIPTION_LINES)}
      >
        {text}
      </Text>
      <Text
        style={[styles.descriptionText, { color: palette.text2 }]}
        {...(expanded ? {} : { numberOfLines: DESCRIPTION_LINES })}
      >
        {text}
      </Text>
      {clamped && (
        <ToggleLink label={expanded ? t('Close') : t('Read more')} palette={palette} onPress={() => setExpanded((value) => !value)} />
      )}
    </View>
  )
}

function TasksSection({
  scope,
  palette,
  t,
  onOpenActions,
}: {
  scope: { projectId: string } | { channelId: string }
  palette: ThemePalette
  t: Translate
  onOpenActions: () => void
}) {
  const tasks = useChatInfoTasks(scope)
  const [expanded, setExpanded] = React.useState(false)
  const sorted = React.useMemo(() => sortTasksForChecklist(tasks.data ?? []), [tasks.data])
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_TASKS)
  const completed = sorted.filter((task) => task.status === 'done').length
  return (
    <View style={[styles.section, { borderBottomColor: palette.divider }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{t('Tasks')}</Text>
        {tasks.data && (
          <Text style={[styles.count, { color: palette.text3 }]}>{`${completed} / ${sorted.length}`}</Text>
        )}
      </View>
      <QueryState
        isLoading={tasks.isLoading}
        error={tasks.error}
        isEmpty={sorted.length === 0}
        emptyLabel={t('No tasks yet')}
        palette={palette}
        t={t}
        onRetry={() => void tasks.refetch()}
      />
      {visible.map((task) => {
        const done = task.status === 'done'
        return (
          <Pressable key={task.id} accessibilityRole="button" onPress={onOpenActions} style={styles.taskRow}>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={done ? palette.accent : palette.text4}
            />
            <Text
              style={[
                styles.taskTitle,
                { color: done ? palette.text4 : palette.text2 },
                done && styles.taskDone,
              ]}
            >
              {formatTaskTitleForDisplay(task.title)}
            </Text>
          </Pressable>
        )
      })}
      {sorted.length > VISIBLE_TASKS && (
        <ToggleLink label={expanded ? t('Show less') : t('Show all')} palette={palette} onPress={() => setExpanded((value) => !value)} />
      )}
    </View>
  )
}

function FilesSection({
  channelId,
  palette,
  t,
  onOpenFile,
}: {
  channelId: string
  palette: ThemePalette
  t: Translate
  onOpenFile: (file: ChatInfoFileDto) => void
}) {
  const files = useChatInfoFiles(channelId)
  const [expanded, setExpanded] = React.useState(false)
  const all = files.data ?? []
  const visible = expanded ? all : all.slice(0, VISIBLE_FILES)
  return (
    <View style={[styles.section, { borderBottomColor: palette.divider }]}>
      <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{t('Files')}</Text>
      <QueryState
        isLoading={files.isLoading}
        error={files.error}
        isEmpty={all.length === 0}
        emptyLabel={t('No files yet')}
        palette={palette}
        t={t}
        onRetry={() => void files.refetch()}
      />
      {visible.map((file) => {
        const isLink = file.fileType === 'link'
        const meta = isLink
          ? t('External link')
          : [formatFileSize(file.fileSize), formatFileTimestamp(file.createdAt)].filter(Boolean).join(' · ')
        return (
          <Pressable
            key={file.id}
            accessibilityRole="button"
            accessibilityLabel={t('Open {name}', { name: file.fileName })}
            onPress={() => onOpenFile(file)}
            style={styles.fileRow}
          >
            <View style={[styles.fileIcon, { backgroundColor: palette.card2 }]}>
              <Ionicons
                name={isLink ? 'link-outline' : isImageMime(file.mimeType) ? 'image-outline' : 'document-text-outline'}
                size={18}
                color={palette.text3}
              />
            </View>
            <View style={styles.fileBody}>
              <Text style={[styles.fileName, { color: palette.text2 }]} numberOfLines={1}>
                {file.fileName}
              </Text>
              <Text style={[styles.fileMeta, { color: palette.text4 }]} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          </Pressable>
        )
      })}
      {all.length > VISIBLE_FILES && (
        <ToggleLink label={expanded ? t('Show less') : t('Show all')} palette={palette} onPress={() => setExpanded((value) => !value)} />
      )}
    </View>
  )
}

function MembersSection({
  channelId,
  projectId,
  label,
  palette,
  t,
  onOpenMember,
}: {
  channelId: string
  projectId: string | undefined
  label: string | null
  palette: ThemePalette
  t: Translate
  onOpenMember: (member: ChannelMemberDto) => void
}) {
  const projectMembers = useProjectMembers(projectId ?? null)
  const channelMembers = useChannelMembers(channelId, !projectId && !!label)
  const members = projectId ? projectMembers : channelMembers
  if (!label) return null
  const all = members.data ?? []
  return (
    <View style={[styles.section, { borderBottomColor: palette.divider }]}>
      <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{label}</Text>
      <QueryState
        isLoading={members.isLoading}
        error={members.error}
        isEmpty={all.length === 0}
        emptyLabel={t('No members')}
        palette={palette}
        t={t}
        onRetry={() => void members.refetch()}
      />
      {all.map((member) => (
        <Pressable
          key={member.userId}
          accessibilityRole="button"
          onPress={() => onOpenMember(member)}
          style={styles.memberRow}
        >
          <UserAvatar name={member.displayName} url={member.avatarUrl} size={26} />
          <Text style={[styles.memberName, { color: palette.text2 }]} numberOfLines={1}>
            {member.displayName}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyLabel,
  palette,
  t,
  onRetry,
}: {
  isLoading: boolean
  error: Error | null
  isEmpty: boolean
  emptyLabel: string
  palette: ThemePalette
  t: Translate
  onRetry: () => void
}) {
  if (isLoading) return <ActivityIndicator style={styles.loading} size="small" color={palette.text3} />
  if (error) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry}>
        <Text style={[styles.stateText, { color: palette.redText }]}>{error.message}</Text>
        <Text style={[styles.toggle, { color: palette.accentText }]}>{t('Retry')}</Text>
      </Pressable>
    )
  }
  return isEmpty ? <Text style={[styles.stateText, { color: palette.text4 }]}>{emptyLabel}</Text> : null
}

function ToggleLink({ label, palette, onPress }: { label: string; palette: ThemePalette; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={[styles.toggle, { color: palette.accentText }]}>{label}</Text>
    </Pressable>
  )
}

function ActionButton({
  icon,
  label,
  palette,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  palette: ThemePalette
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.actionButton, { borderColor: palette.border, backgroundColor: palette.card2 }]}
    >
      <Ionicons name={icon} size={15} color={palette.text2} />
      <Text style={[styles.actionButtonText, { color: palette.text2 }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: { position: 'absolute', top: 0, right: 0, bottom: 0, width: DRAWER_WIDTH, borderLeftWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  closeButton: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  count: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hash: { fontSize: 15, fontWeight: '700' },
  headingName: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4 },
  note: { fontSize: 12, marginTop: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, marginTop: 10, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  actionButtonText: { fontSize: 13.5, fontWeight: '600' },
  statusChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  description: { marginTop: 12 },
  descriptionText: { fontSize: 13.5, lineHeight: 21 },
  measure: { position: 'absolute', opacity: 0, left: 0, right: 0 },
  toggle: { fontSize: 12.5, fontWeight: '600', marginTop: 6 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 36, paddingVertical: 6 },
  taskTitle: { flex: 1, fontSize: 13.5, lineHeight: 20 },
  taskDone: { textDecorationLine: 'line-through' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 5 },
  fileIcon: { width: 32, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  fileBody: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileMeta: { fontSize: 11, marginTop: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingVertical: 4 },
  memberName: { flex: 1, fontSize: 13.5 },
  stateText: { fontSize: 12.5, paddingVertical: 4 },
  loading: { alignSelf: 'flex-start', marginVertical: 6 },
  moreActions: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16 },
  moreActionsText: { flex: 1, fontSize: 13.5, fontWeight: '600' },
})
