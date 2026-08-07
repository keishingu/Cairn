'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { Avatar, Icon, fieldInputStyle } from './primitives'
import { useWorkspaceMembers, useProjectMembers } from '@/hooks/use-project-members'

interface AssigneeCandidate {
  userId: string
  displayName: string
  avatarUrl: string | null
  inProject: boolean
  // 担当者に設定可能か（サーバの isAssignableTaskMember と揃える）。
  // member 以上は常に可、guest はプロジェクトタスクかつ当該プロジェクトのメンバーのみ可。
  assignable: boolean
}

interface TaskAssigneeFieldProps {
  value: string | null
  onChange: (userId: string | null) => void
  // 選択中プロジェクト。指定するとそのプロジェクトのメンバーを候補上部に優先表示する。
  projectId?: string | null
  // 現在の担当者表示。非活性化などで active メンバー一覧に出ない担当者でも
  // 「担当者なし」に見えないようフォールバック表示する。
  currentAssignee?: { userId: string; displayName: string; avatarUrl: string | null } | null
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  display: 'block',
  marginBottom: 6,
}

// ワークスペース全体から担当者を検索・選択する。プロジェクト選択時はプロジェクト内メンバーを
// 上部に優先表示し「プロジェクト内」ラベルを付ける。
export const TaskAssigneeField = ({ value, onChange, projectId, currentAssignee }: TaskAssigneeFieldProps) => {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [menuPosition, setMenuPosition] = React.useState<{
    left: number
    top?: number
    bottom?: number
    width: number
    maxListHeight: number
  } | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const { data: workspaceMembers = [] } = useWorkspaceMembers()
  const projectMembersQuery = useProjectMembers(projectId ?? null)
  const projectMembers = projectMembersQuery.data ?? []

  const projectMemberIds = React.useMemo(
    () => new Set(projectMembers.map(m => m.userId)),
    [projectMembers],
  )

  // プロジェクト内メンバーを先頭に、以降を名前順で並べる
  const candidates = React.useMemo<AssigneeCandidate[]>(() => {
    const list = workspaceMembers.map(m => {
      const inProject = projectMemberIds.has(m.userId)
      // guest はプロジェクトタスクかつ当該プロジェクトのメンバーのときだけ担当者にできる
      const assignable = m.role !== 'guest' || (projectId != null && projectId !== '' && inProject)
      return {
        userId: m.userId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        inProject,
        assignable,
      }
    })
    return list.sort((a, b) => {
      if (a.inProject !== b.inProject) return a.inProject ? -1 : 1
      return a.displayName.localeCompare(b.displayName, 'ja')
    })
  }, [workspaceMembers, projectMemberIds, projectId])

  // 選択肢には担当者に設定できるメンバーのみを出す（不可なゲストは 422 になるため除外）
  const assignableCandidates = React.useMemo(
    () => candidates.filter(c => c.assignable),
    [candidates],
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assignableCandidates
    return assignableCandidates.filter(c => c.displayName.toLowerCase().includes(q))
  }, [assignableCandidates, query])

  // 表示用の選択中担当者。active 一覧に居ればそれを、居なければフォールバック（非活性担当者等）を使う。
  const selected = React.useMemo(() => {
    if (value == null) return null
    const inList = candidates.find(c => c.userId === value)
    if (inList) return { displayName: inList.displayName, avatarUrl: inList.avatarUrl }
    if (currentAssignee && currentAssignee.userId === value) {
      return { displayName: currentAssignee.displayName, avatarUrl: currentAssignee.avatarUrl }
    }
    return null
  }, [candidates, value, currentAssignee])

  // プロジェクト変更などで選択中の担当者が「割り当て不可」に変わったら解除する（送信時の 422 を防ぐ）。
  // 既存担当者（currentAssignee）はフォールバック表示のため保持し、取得中は判定しない。
  React.useEffect(() => {
    if (value == null) return
    if (currentAssignee && currentAssignee.userId === value) return
    if (projectMembersQuery.isFetching) return
    const c = candidates.find(x => x.userId === value)
    if (c && !c.assignable) onChange(null)
  }, [value, candidates, currentAssignee, projectMembersQuery.isFetching, onChange])

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportMargin = 8
    const menuGap = 4
    const menuChromeHeight = 53
    const desiredListHeight = 220
    const desiredMenuHeight = menuChromeHeight + desiredListHeight
    const availableBelow = window.innerHeight - rect.bottom - viewportMargin - menuGap
    const availableAbove = rect.top - viewportMargin - menuGap
    const openAbove = availableBelow < desiredMenuHeight && availableAbove > availableBelow
    const availableHeight = Math.max(0, openAbove ? availableAbove : availableBelow)
    const width = Math.min(rect.width, window.innerWidth - viewportMargin * 2)
    const left = Math.min(
      Math.max(viewportMargin, rect.left),
      Math.max(viewportMargin, window.innerWidth - viewportMargin - width),
    )

    setMenuPosition({
      left,
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + menuGap }
        : { top: rect.bottom + menuGap }),
      width,
      maxListHeight: Math.max(80, Math.min(desiredListHeight, availableHeight - menuChromeHeight)),
    })
  }, [])

  React.useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  const handleSelect = (userId: string | null) => {
    onChange(userId)
    setOpen(false)
    setQuery('')
  }

  const portalHost = containerRef.current?.closest<HTMLElement>('.app-root')

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label style={labelStyle}>担当者</label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...fieldInputStyle(false),
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {selected ? (
          <>
            <Avatar name={selected.displayName} url={selected.avatarUrl} size={20} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.displayName}
            </span>
          </>
        ) : (
          <span style={{ flex: 1, color: 'var(--text-4)' }}>担当者を選択（任意）</span>
        )}
        <Icon name="chevDown" size={13} color="var(--text-3)" />
      </button>

      {open && menuPosition && portalHost && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: menuPosition.left,
            ...(menuPosition.top != null ? { top: menuPosition.top } : {}),
            ...(menuPosition.bottom != null ? { bottom: menuPosition.bottom } : {}),
            width: menuPosition.width,
            zIndex: 1100,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--divider)' }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="メンバーを検索..."
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              style={{ ...fieldInputStyle(false), padding: '7px 10px' }}
            />
          </div>
          <div style={{ maxHeight: menuPosition.maxListHeight, overflow: 'auto', padding: 4 }}>
            <button
              type="button"
              onClick={() => handleSelect(null)}
              style={optionStyle(value === null)}
            >
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--card-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="x" size={11} color="var(--text-3)" />
              </span>
              <span style={{ flex: 1 }}>担当者なし</span>
            </button>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-4)' }}>該当するメンバーがいません</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => handleSelect(c.userId)}
                  style={optionStyle(c.userId === value)}
                >
                  <Avatar name={c.displayName} url={c.avatarUrl} size={20} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.displayName}
                  </span>
                  {c.inProject && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--accent-text)',
                      background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                    }}>プロジェクト内</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        portalHost,
      )}
    </div>
  )
}

function optionStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 8px',
    borderRadius: 8,
    border: 'none',
    background: selected ? 'var(--accent-soft)' : 'transparent',
    color: selected ? 'var(--accent-text)' : 'var(--text)',
    fontSize: 12.5,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  }
}
