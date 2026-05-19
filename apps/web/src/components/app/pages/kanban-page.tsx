'use client'

import React from 'react'
import { Icon } from '../primitives'
import { KanbanBoard } from '../kanban'

interface PageKanbanProps {
  openPanel: () => void
}

export const PageKanban = ({ openPanel }: PageKanbanProps) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn"><Icon name="filter" size={13}/> フィルター</button>
        <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>グループ: ステータス <Icon name="chevDown" size={13}/></button>
        <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>すべてのプロジェクト <Icon name="chevDown" size={13}/></button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn"><Icon name="settings" size={13}/> ステージ設定</button>
        <button className="btn btn-primary"><Icon name="plus" size={13}/> 新規プロジェクト</button>
      </div>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      <KanbanBoard onCardClick={openPanel}/>
    </div>
  </div>
)
