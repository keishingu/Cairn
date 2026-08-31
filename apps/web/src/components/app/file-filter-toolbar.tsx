'use client'

import React from 'react'
import { Icon } from './primitives'
import type {
  FileFilterConditions,
  FileTypeFilter,
  SavedFileFilterDto,
} from '@/lib/files/saved-file-filter'

interface FilterOption {
  id: string
  label: string
}

interface FileFilterToolbarProps {
  isMobile: boolean
  conditions: FileFilterConditions
  counts: Record<FileTypeFilter, number>
  projects: FilterOption[]
  uploaders: FilterOption[]
  savedFilters: SavedFileFilterDto[]
  activeSavedFilterId: string | null
  isSaving: boolean
  isLoadingSavedFilters: boolean
  savedFiltersError: boolean
  onChange: (conditions: FileFilterConditions) => void
  onApplySavedFilter: (filter: SavedFileFilterDto) => void
  onDeleteSavedFilter: (filterId: string) => void
  onSave: (name: string) => Promise<void>
  onClear: () => void
}

const typeFilters: { id: FileTypeFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'pdf', label: 'PDF' },
  { id: 'img', label: '画像' },
  { id: 'doc', label: 'ドキュメント' },
]

const selectStyle: React.CSSProperties = { minWidth: 150 }

export function FileFilterToolbar({
  isMobile,
  conditions,
  counts,
  projects,
  uploaders,
  savedFilters,
  activeSavedFilterId,
  isSaving,
  isLoadingSavedFilters,
  savedFiltersError,
  onChange,
  onApplySavedFilter,
  onDeleteSavedFilter,
  onSave,
  onClear,
}: FileFilterToolbarProps) {
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState('')

  const activeConditionCount = [
    conditions.projectId !== 'all',
    conditions.uploaderId !== 'all',
    Boolean(conditions.createdFrom),
    Boolean(conditions.createdTo),
    Boolean(conditions.search),
  ].filter(Boolean).length

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedName = saveName.trim()
    if (!normalizedName) return
    try {
      await onSave(normalizedName)
      setSaveName('')
    } catch {
      // エラー表示は Domain Hook の共通トーストへ委ね、入力値は再試行用に残す。
    }
  }

  const update = <K extends keyof FileFilterConditions>(key: K, value: FileFilterConditions[K]) =>
    onChange({ ...conditions, [key]: value })

  return (
    <div
      style={{
        padding: isMobile ? '8px 12px' : '10px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
      }}
    >
      {isMobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--card-2)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '0 10px',
            height: 32,
          }}
        >
          <Icon name="search" size={13} color="var(--text-3)" />
          <input
            value={conditions.search}
            onChange={(event) => update('search', event.target.value)}
            placeholder="ファイル名・プロジェクトで検索"
            aria-label="ファイルを検索"
            style={{
              flex: 1,
              fontSize: 12.5,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              caretColor: 'var(--accent)',
            }}
          />
          {conditions.search && (
            <button
              onClick={() => update('search', '')}
              aria-label="検索をクリア"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                color: 'var(--text-3)',
              }}
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          role="group"
          aria-label="ファイル表示フィルター"
          style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', minWidth: 0 }}
        >
          {typeFilters.map((filter) => {
            const active = activeSavedFilterId === null && conditions.type === filter.id
            return (
              <button
                key={filter.id}
                onClick={() => update('type', filter.id)}
                aria-pressed={active}
                style={{
                  padding: isMobile ? '6px 8px' : '6px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: active ? 'var(--card-hover)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-3)',
                  fontSize: isMobile ? 12 : 12.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {filter.label} ({counts[filter.id]})
              </button>
            )
          })}
          {savedFilters.map((filter) => {
            const active = activeSavedFilterId === filter.id
            return (
              <div
                key={filter.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 6,
                  background: active ? 'var(--card-hover)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-3)',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => onApplySavedFilter(filter)}
                  aria-pressed={active}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: isMobile ? '6px 3px 6px 8px' : '6px 3px 6px 10px',
                    color: 'inherit',
                    fontSize: isMobile ? 12 : 12.5,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {filter.name}
                </button>
                <button
                  onClick={() => onDeleteSavedFilter(filter.id)}
                  aria-label={`保存済みフィルター「${filter.name}」を削除`}
                  title={`保存済みフィルター「${filter.name}」を削除`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: isMobile ? '6px 5px 6px 2px' : '6px 6px 6px 2px',
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            )
          })}
          {isLoadingSavedFilters && (
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
              読み込み中…
            </span>
          )}
        </div>
        <button
          className="btn"
          onClick={() => setFilterOpen((open) => !open)}
          aria-expanded={filterOpen}
          style={{
            flexShrink: 0,
            ...(activeConditionCount > 0
              ? {
                  borderColor: 'var(--accent)',
                  color: 'var(--accent-text)',
                  background: 'var(--accent-soft)',
                }
              : {}),
          }}
        >
          <Icon name="filter" size={13} />
          {!isMobile && 'フィルター'}
          {activeConditionCount > 0 && (
            <span
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
              }}
            >
              {activeConditionCount}
            </span>
          )}
        </button>
      </div>

      {savedFiltersError && (
        <span role="alert" style={{ fontSize: 11.5, color: 'var(--red-text)' }}>
          保存フィルターを読み込めませんでした
        </span>
      )}

      {filterOpen && (
        <form
          onSubmit={handleSave}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'end',
            gap: 8,
            padding: 10,
            background: 'var(--card-2)',
            borderRadius: 8,
          }}
        >
          {!isMobile && (
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 11.5,
                color: 'var(--text-3)',
              }}
            >
              キーワード
              <input
                className="form-control"
                value={conditions.search}
                onChange={(event) => update('search', event.target.value)}
                placeholder="ファイル名・プロジェクト"
                style={{ width: 190 }}
              />
            </label>
          )}
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 11.5,
              color: 'var(--text-3)',
            }}
          >
            プロジェクト
            <select
              className="form-control"
              value={conditions.projectId}
              onChange={(event) => update('projectId', event.target.value)}
              style={selectStyle}
            >
              <option value="all">すべて</option>
              <option value="none">プロジェクトなし</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 11.5,
              color: 'var(--text-3)',
            }}
          >
            アップロード者
            <select
              className="form-control"
              value={conditions.uploaderId}
              onChange={(event) => update('uploaderId', event.target.value)}
              style={selectStyle}
            >
              <option value="all">すべて</option>
              {uploaders.map((uploader) => (
                <option key={uploader.id} value={uploader.id}>
                  {uploader.label}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 11.5,
              color: 'var(--text-3)',
            }}
          >
            開始日
            <input
              className="form-control"
              type="date"
              value={conditions.createdFrom ?? ''}
              onChange={(event) => update('createdFrom', event.target.value || null)}
            />
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 11.5,
              color: 'var(--text-3)',
            }}
          >
            終了日
            <input
              className="form-control"
              type="date"
              value={conditions.createdTo ?? ''}
              onChange={(event) => update('createdTo', event.target.value || null)}
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            クリア
          </button>
          <div style={{ flexBasis: '100%', height: 0 }} />
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 11.5,
              color: 'var(--text-3)',
              flex: isMobile ? '1 1 180px' : '0 1 240px',
            }}
          >
            現在の条件を保存
            <input
              className="form-control"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="例: 計画書"
              maxLength={50}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!saveName.trim() || isSaving}>
            {isSaving ? '保存中…' : '保存'}
          </button>
        </form>
      )}
    </div>
  )
}
