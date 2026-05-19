'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack } from './primitives'
import { PROJECTS, MEMBERS, STATUS, STATUS_COL, Project, StatusKey } from './data'

interface KanbanCardProps {
  p: Project
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}

const KanbanCard = ({ p, onClick, onDragStart, onDragEnd, dragging }: KanbanCardProps) => {
  const cfg = STATUS_COL[p.status]
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 12px',
        borderLeft: `3px solid ${cfg.bar}`,
        cursor: 'grab',
        transition: 'box-shadow .12s, transform .12s, opacity .12s',
        boxShadow: 'var(--shadow-sm)',
        opacity: dragging ? 0.4 : 1,
      }}
      onMouseEnter={e => { if (!dragging) { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>{p.name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>{p.dates}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 4))} size={20} max={4}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="chat" size={11.5}/>{p.unread || Math.floor(p.members / 2) + 1}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={11.5}/>{p.unread ? p.unread - 1 : 2}</span>
        </div>
      </div>
    </div>
  )
}

interface KanbanColumnProps {
  status: StatusKey
  items: Project[]
  onCardClick: () => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  draggingId: string | null
  onDrop: (status: StatusKey) => void
  dropTarget: StatusKey | null
  onDragOver: (status: StatusKey | null) => void
}

const KanbanColumn = ({ status, items, onCardClick, onDragStart, onDragEnd, draggingId, onDrop, dropTarget, onDragOver }: KanbanColumnProps) => {
  const cfg = STATUS_COL[status]
  const isTarget = dropTarget === status
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(status) }}
      onDragLeave={() => onDragOver(null)}
      onDrop={e => { e.preventDefault(); onDrop(status) }}
      style={{
        background: cfg.bg, borderRadius: 10,
        display: 'flex', flexDirection: 'column',
        minWidth: 0, minHeight: 0,
        outline: isTarget ? `2px dashed ${cfg.bar}` : '2px dashed transparent',
        outlineOffset: -2,
        transition: 'outline-color .12s',
      }}
    >
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: cfg.text, letterSpacing: '0.01em' }}>{STATUS[status].label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: cfg.text, opacity: 0.7 }}>{items.length}</span>
      </div>
      <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'auto' }}>
        {items.map(p => (
          <KanbanCard key={p.id} p={p}
            onClick={onCardClick}
            onDragStart={() => onDragStart(p.id)}
            onDragEnd={onDragEnd}
            dragging={draggingId === p.id}/>
        ))}
        <button style={{
          border: 'none', background: 'transparent',
          padding: '8px 6px', fontSize: 12, fontWeight: 500,
          color: cfg.text, opacity: 0.8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', textAlign: 'left',
        }}>
          <Icon name="plus" size={13}/> カードを追加
        </button>
      </div>
    </div>
  )
}

interface KanbanBoardProps {
  onCardClick: () => void
}

export const KanbanBoard = ({ onCardClick }: KanbanBoardProps) => {
  const cols: StatusKey[] = ['plan', 'review', 'wait', 'doing', 'retro']
  const [items, setItems] = React.useState(PROJECTS)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<StatusKey | null>(null)
  const groups = Object.fromEntries(cols.map(c => [c, items.filter(p => p.status === c)])) as Record<StatusKey, Project[]>

  const onDragStart = (id: string) => setDraggingId(id)
  const onDragEnd = () => { setDraggingId(null); setDropTarget(null) }
  const onDragOver = (status: StatusKey | null) => setDropTarget(status)
  const onDrop = (status: StatusKey) => {
    if (!draggingId) return
    setItems(prev => prev.map(p => p.id === draggingId ? { ...p, status } : p))
    setDraggingId(null)
    setDropTarget(null)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, height: '100%' }}>
      {cols.map(c => (
        <KanbanColumn key={c}
          status={c}
          items={groups[c]}
          onCardClick={onCardClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          draggingId={draggingId}
          dropTarget={dropTarget}/>
      ))}
    </div>
  )
}
