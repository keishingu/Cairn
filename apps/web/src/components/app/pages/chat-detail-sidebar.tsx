'use client'

import React from 'react'
import { Icon, Avatar, StatusChip } from '../primitives'
import { ChannelMemberSheet } from '../mobile/channel-member-sheet'
import { FileTypeIcon, GoogleDocsIcon } from '../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../image-lightbox'
import { useProjectTasks } from '@/hooks/use-project-tasks'
import { useChannelFiles } from '@/hooks/use-channel-files'
import type { ProjectDto } from '@/app/api/projects/route'
import type { TaskDto } from '@/app/api/tasks/route'
import type { ChannelFileDto } from '@/app/api/channels/[channelId]/files/route'

export interface ChatDetailMember {
  /** ワークスペースメンバーの userId（プロフィールを開けるときのみ。全体チャンネルでは未取得） */
  userId?: string
  name: string
  url: string | null
}

export interface ChatDetailSidebarProps {
  isProject: boolean
  isDm: boolean
  isPrivate: boolean
  channelName: string
  currentDmAvatarUrl: string | null | undefined
  /** DM 相手の userId（プロフィールを開く用） */
  dmParticipantId: string | null
  /** プロジェクトチャンネルの紐づくプロジェクト概要（未取得なら null） */
  project: ProjectDto | null
  channelMembers: ChatDetailMember[]
  /** メンバー欄の見出し（チャンネル種別で意味が変わるため）。null のときは欄ごと非表示 */
  memberLabel: string | null
  channelId: string | null
  showMemberInvite: boolean
  onInviteMember: () => void
  onCloseMemberInvite: () => void
  /** 紐づくプロジェクトを詳細パネルで開く */
  onOpenProject: () => void
  /** メンバーのプロフィールを開く */
  onOpenMember: (userId: string) => void
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
}

function formatDate(iso: string): string {
  // Postgres date 列の 'YYYY-MM-DD' を UTC 解釈せずローカル日付として扱う（負オフセットで前日になるのを防ぐ）
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${y}/${m}/${d}`
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  if (start && end) return `${formatDate(start)} 〜 ${formatDate(end)}`
  if (start) return `${formatDate(start)} 〜`
  return `〜 ${formatDate(end!)}`
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatFileTimestamp(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 長い説明文は5行でクランプし、下端をフェードアウト → 「続きを読む」で全文展開する
const ExpandableDescription = ({ text }: { text: string }) => {
  const ref = React.useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [clamped, setClamped] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // クランプ時に内容が溢れているか（=「続きを読む」が必要か）を判定
    setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [text])

  const collapsedStyle: React.CSSProperties = expanded ? {} : {
    display: '-webkit-box',
    WebkitLineClamp: 5,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <p ref={ref} style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...collapsedStyle }}>
          {text}
        </p>
        {clamped && !expanded && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 28, background: 'linear-gradient(to bottom, transparent, var(--card))', pointerEvents: 'none' }}/>
        )}
      </div>
      {clamped && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: 4, border: 'none', background: 'transparent', color: 'var(--accent-text)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
        >
          {expanded ? '閉じる' : '続きを読む'}
        </button>
      )}
    </div>
  )
}

// チェックボックス付きのタスク箇条書き。チェックは PATCH で連動し、進捗にも反映される
const TaskChecklist = ({ project }: { project: ProjectDto }) => {
  const { data: tasks = [], isLoading, toggleMutation } = useProjectTasks(project.id)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [clamped, setClamped] = React.useState(false)

  const toggle = (id: string, status: TaskDto['status']) =>
    toggleMutation.mutate({ id, newStatus: status === 'done' ? 'todo' : 'done' })

  // 未完了タスクを上に、完了済みタスクを下にまとめる（各グループ内の順序は維持）
  const sortedTasks = React.useMemo(
    () => [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')),
    [tasks],
  )

  // 読み込み済みなら実データ、未読込なら ProjectDto の集計値を使う
  const total = isLoading ? project.taskCount : tasks.length
  const completed = isLoading ? project.completedTaskCount : tasks.filter(t => t.status === 'done').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  React.useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [sortedTasks])

  const collapsedStyle: React.CSSProperties = expanded ? {} : {
    maxHeight: 220,
    overflow: 'hidden',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="check" size={12} color="var(--emerald)"/>
          タスク
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
          {completed} / {total}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'var(--card-2)', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'var(--emerald)', transition: 'width .2s' }}/>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '8px 0 2px' }}>読み込み中…</div>
      ) : tasks.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '8px 0 2px' }}>タスクはまだありません</div>
      ) : (
        <div>
          <div style={{ position: 'relative' }}>
            <div ref={listRef} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2, ...collapsedStyle }}>
              {sortedTasks.map(t => {
                const done = t.status === 'done'
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
                    <button
                      onClick={() => toggle(t.id, t.status)}
                      aria-pressed={done}
                      aria-label={done ? 'タスクを未完了に戻す' : 'タスクを完了にする'}
                      style={{
                        flexShrink: 0, marginTop: 1, width: 16, height: 16, borderRadius: '50%',
                        border: done ? 'none' : '1.5px solid var(--border-2)',
                        background: done ? 'var(--emerald)' : 'transparent',
                        color: '#fff', cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {done && <Icon name="check" size={10} color="#fff" strokeWidth={3}/>}
                    </button>
                    <span style={{ fontSize: 12.5, lineHeight: 1.5, color: done ? 'var(--text-4)' : 'var(--text-2)', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word', flex: 1 }}>
                      {t.title}
                    </span>
                  </div>
                )
              })}
            </div>
            {clamped && !expanded && (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 28, background: 'linear-gradient(to bottom, transparent, var(--card))', pointerEvents: 'none' }}/>
            )}
          </div>
          {clamped && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ marginTop: 4, border: 'none', background: 'transparent', color: 'var(--accent-text)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              {expanded ? 'たたむ' : 'すべて表示'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function isImageChannelFile(f: ChannelFileDto): boolean {
  return f.fileType !== 'link' && (f.mimeType?.startsWith('image/') ?? false)
}

// チャンネル内でアップロード・共有されたファイルの一覧。3件を超える分は「すべて表示」で展開する。
// クリック時の挙動はチャット本文の添付と揃える: 画像はライトボックス、それ以外は /api/attachments を新規タブで開く
const ChannelFilesSection = ({ channelId }: { channelId: string | null }) => {
  const { data: files = [], isLoading, isError } = useChannelFiles(channelId)
  const [expanded, setExpanded] = React.useState(false)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)

  const VISIBLE_COUNT = 3
  const visibleFiles = expanded ? files : files.slice(0, VISIBLE_COUNT)
  const hasMore = files.length > VISIBLE_COUNT

  const imageFiles = React.useMemo(() => files.filter(isImageChannelFile), [files])
  const lightboxImages = React.useMemo<LightboxImage[]>(() => imageFiles.map(f => ({
    key: f.id,
    src: `/api/attachments/${f.id}`,
    caption: f.fileName,
  })), [imageFiles])
  const openLightbox = React.useCallback((fileId: string) => {
    const idx = imageFiles.findIndex(f => f.id === fileId)
    if (idx >= 0) setLightboxIndex(idx)
  }, [imageFiles])

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
      <div style={SECTION_LABEL}>ファイル</div>
      {isLoading ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>読み込み中…</div>
      ) : isError ? (
        <div style={{ fontSize: 11.5, color: 'var(--red-text)', padding: '4px 0' }}>ファイルの取得に失敗しました</div>
      ) : files.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>ファイルはまだありません</div>
      ) : (
        <div>
          {visibleFiles.map((f: ChannelFileDto) => {
            const isLink = f.fileType === 'link'
            const isImage = isImageChannelFile(f)
            const linkHref = isLink ? f.externalUrl : `/api/attachments/${f.id}`
            const sizeStr = formatFileSize(f.fileSize)
            const meta = isLink ? '外部リンク' : [sizeStr, formatFileTimestamp(f.createdAt)].filter(Boolean).join(' · ')

            return (
              <a
                key={f.id}
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={isImage ? (e => { e.preventDefault(); openLightbox(f.id) }) : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', margin: '0 -6px', borderRadius: 7, textDecoration: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {isLink && f.externalUrl
                  ? <GoogleDocsIcon url={f.externalUrl} width={26} height={30}/>
                  : <FileTypeIcon mimeType={f.mimeType} fileName={f.fileName} fileId={f.id} width={26} height={30}/>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.fileName}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{meta}</div>
                </div>
              </a>
            )
          })}
          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ marginTop: 4, border: 'none', background: 'transparent', color: 'var(--accent-text)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              {expanded ? 'たたむ' : 'すべて表示'}
            </button>
          )}
        </div>
      )}

      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={Math.min(lightboxIndex, lightboxImages.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

// 紐づくプロジェクトの概要（ステータス・説明・タスク進捗）。期間・詳細パネルへの導線は見出し部分に表示
const ProjectOverview = ({ project }: { project: ProjectDto }) => {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {project.statusName && (
        <div>
          <StatusChip name={project.statusName} color={project.statusColor ?? 'var(--text-3)'}/>
        </div>
      )}

      {project.description && <ExpandableDescription text={project.description}/>}

      <TaskChecklist project={project}/>
    </div>
  )
}

// PC サイドバー / モバイルドロワーで共有する中身
const ChatDetailContent = ({
  isProject, isDm, isPrivate, channelName,
  currentDmAvatarUrl, dmParticipantId, project, channelMembers, memberLabel,
  channelId, showMemberInvite, onInviteMember, onCloseMemberInvite,
  onOpenProject, onOpenMember,
}: ChatDetailSidebarProps) => (
  <>
    {isProject ? (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{channelName}</div>
        {project && formatDateRange(project.startDate, project.endDate) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            <Icon name="calendar" size={12} color="var(--text-4)"/>
            {formatDateRange(project.startDate, project.endDate)}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 4 }}>プロジェクトチャンネル</div>
        <button
          onClick={onOpenProject}
          style={{
            marginTop: 10, width: '100%', height: 34, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--card-2)',
            color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Icon name="arrowRight" size={13}/>
          プロジェクトを開く
        </button>
      </div>
    ) : (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isDm
            ? <Avatar name={channelName} url={currentDmAvatarUrl ?? null} size={18}/>
            : isPrivate
              ? <Icon name="lock" size={14} color="var(--amber-text)"/>
              : <Icon name="hash" size={14} color="var(--text-3)"/>}
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{channelName}</span>
        </div>
        {isDm && (
          <button
            onClick={() => dmParticipantId && onOpenMember(dmParticipantId)}
            disabled={!dmParticipantId}
            style={{
              marginTop: 10, width: '100%', height: 34, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card-2)',
              color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
              cursor: dmParticipantId ? 'pointer' : 'default', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="users" size={13}/>
            プロフィールを見る
          </button>
        )}
        {isPrivate && (
          <>
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--amber-soft)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={12} color="var(--amber-text)"/>
              <span style={{ fontSize: 11.5, color: 'var(--amber-text)', fontWeight: 600 }}>招待されたメンバーのみが閲覧できます</span>
            </div>
            <button
              onClick={onInviteMember}
              style={{
                marginTop: 10, width: '100%', height: 34, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--card-2)',
                color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="userPlus" size={13}/>
              メンバーを招待
            </button>
            {showMemberInvite && channelId && (
              <ChannelMemberSheet channelId={channelId} onClose={onCloseMemberInvite}/>
            )}
          </>
        )}
      </div>
    )}

    {isProject && project && <ProjectOverview project={project}/>}

    <ChannelFilesSection channelId={channelId}/>

    {memberLabel && (
    <div style={{ padding: '12px 16px' }}>
      <div style={SECTION_LABEL}>{memberLabel}</div>
      {channelMembers.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>メンバーはいません</div>
      ) : channelMembers.map((m, i) => {
        const clickable = !!m.userId
        return (
          <div
            key={m.userId ?? m.name}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onOpenMember(m.userId!) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onOpenMember(m.userId!) } : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
              margin: '0 -6px', borderRadius: 7,
              cursor: clickable ? 'pointer' : 'default',
            }}
            onMouseEnter={clickable ? (e) => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' } : undefined}
            onMouseLeave={clickable ? (e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' } : undefined}
          >
            <div style={{ position: 'relative' }}>
              <Avatar name={m.name} url={m.url} size={24}/>
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < 3 ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m.name}</span>
          </div>
        )
      })}
    </div>
    )}
  </>
)

function panelTitle({ isProject, isDm }: { isProject: boolean; isDm: boolean }): string {
  return isProject ? 'このプロジェクトについて' : isDm ? 'ダイレクトメッセージ' : 'このチャンネルについて'
}

// PC: 3カラムレイアウト右端の常設サイドバー
export const ChatDetailSidebar = (props: ChatDetailSidebarProps) => (
  <aside style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{panelTitle(props)}</h3>
    </div>
    <ChatDetailContent {...props}/>
  </aside>
)

// モバイル: ベルと同じく右からスライドインするインフォメーションドロワー
// （MobileNav が zIndex:50 で固定されているため、ナビより前面に出す）
export const ChatInfoDrawer = ({ onClose, ...props }: ChatDetailSidebarProps & { onClose: () => void }) => (
  <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 60, animation: 'notifFadeIn .15s ease-out' }}/>
    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(86vw, 360px)', background: 'var(--card)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', zIndex: 61, display: 'flex', flexDirection: 'column', overflow: 'auto', animation: 'notifSlideIn .2s cubic-bezier(.2,.7,.3,1)' }}>
      <div style={{ padding: '14px 16px 12px', paddingTop: 'max(14px, env(safe-area-inset-top))', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1 }}>{panelTitle(props)}</h3>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--card-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="close" size={15}/>
        </button>
      </div>
      <ChatDetailContent {...props}/>
    </aside>
  </>
)
