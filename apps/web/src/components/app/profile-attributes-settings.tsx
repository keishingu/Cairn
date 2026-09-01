'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { ConfirmDialog } from './confirm-dialog'
import { RowActionMenu } from './row-action-menu'
import {
  PROFILE_ATTRIBUTE_COLOR_OPTIONS,
  ProfileAttributeBadges,
} from './profile-attribute-badges'

const QUERY_KEY = ['profile-attributes'] as const

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error ?? fallback
}

async function fetchProfileAttributes(): Promise<ProfileAttributeDto[]> {
  const response = await fetchWithAuth('/api/workspaces/profile-attributes')
  if (!response.ok) throw new Error(await readError(response, '属性を取得できませんでした'))
  return response.json() as Promise<ProfileAttributeDto[]>
}

function ColorPicker({
  value,
  onChange,
}: {
  value: ProfileAttributeColor
  onChange: (value: ProfileAttributeColor) => void
}) {
  return (
    <div role="group" aria-label="ラベルの色" style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {PROFILE_ATTRIBUTE_COLOR_OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          className="btn btn-ghost"
          aria-label={option.label}
          aria-pressed={value === option.id}
          title={option.label}
          onClick={() => onChange(option.id)}
          style={{
            width: 40,
            height: 40,
            padding: 8,
            border: 'none',
            borderRadius: 8,
            background: value === option.id ? option.background : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: option.swatch,
              boxShadow: value === option.id ? `0 0 0 2px var(--card), 0 0 0 4px ${option.swatch}` : 'none',
            }}
          />
        </button>
      ))}
    </div>
  )
}

function AttributeRow({
  attribute,
  canManage,
  onChanged,
}: {
  attribute: ProfileAttributeDto
  canManage: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [name, setName] = React.useState(attribute.name)
  const [color, setColor] = React.useState(attribute.color)

  React.useEffect(() => {
    setName(attribute.name)
    setColor(attribute.color)
  }, [attribute.name, attribute.color])

  const update = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`/api/workspaces/profile-attributes/${attribute.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (!response.ok) throw new Error(await readError(response, '属性を更新できませんでした'))
    },
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const remove = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`/api/workspaces/profile-attributes/${attribute.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readError(response, '属性を削除できませんでした'))
    },
    onSuccess: onChanged,
  })

  if (editing) {
    return (
      <div style={{ padding: 16, background: 'var(--card-2)' }}>
        <label htmlFor={`profile-attribute-${attribute.id}`} style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
          属性名
        </label>
        <input
          id={`profile-attribute-${attribute.id}`}
          name="profileAttributeName"
          autoComplete="off"
          className="form-control"
          value={name}
          maxLength={20}
          aria-invalid={update.isError}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && name.trim()) update.mutate()
            if (event.key === 'Escape') setEditing(false)
          }}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <ColorPicker value={color} onChange={setColor} />
        {update.error && <p role="alert" style={{ margin: '6px 0 0', color: 'var(--red-text)', fontSize: 12 }}>{update.error.message}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => { setName(attribute.name); setColor(attribute.color); setEditing(false) }}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim() || update.isPending} onClick={() => update.mutate()}>
            {update.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: 56, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ProfileAttributeBadges attributes={[attribute]} />
      </div>
      {canManage && (
        <RowActionMenu actions={[
          { icon: 'edit', label: '編集', onSelect: () => { setName(attribute.name); setColor(attribute.color); setEditing(true) } },
          { icon: 'trash', label: '削除', danger: true, onSelect: () => setConfirmDelete(true) },
        ]} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="属性を削除"
        message={`「${attribute.name}」を削除します。設定済みのすべてのメンバーからも外れます。`}
        onConfirm={() => remove.mutateAsync()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export function ProfileAttributesSettings() {
  const queryClient = useQueryClient()
  const { isAdmin } = useWorkspacePermissions()
  const { data: attributes = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProfileAttributes,
  })
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState<ProfileAttributeColor>('slate')
  const cancelAdding = () => {
    setName('')
    setColor('slate')
    setAdding(false)
  }

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['workspace-members'] }),
    queryClient.invalidateQueries({ queryKey: ['messages'] }),
  ])
  const create = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth('/api/workspaces/profile-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (!response.ok) throw new Error(await readError(response, '属性を追加できませんでした'))
    },
    onSuccess: async () => {
      setName('')
      setColor('slate')
      setAdding(false)
      await invalidate()
    },
  })

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>プロフィール属性</h1>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
            メンバーに付ける共通ラベルと色を管理します。属性はワークスペース内のすべてのプロジェクトで共有されます。
          </p>
        </div>
        {isAdmin && !adding && (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} style={{ flexShrink: 0 }}>
            属性を追加
          </button>
        )}
      </div>

      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>属性一覧</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {adding && (
            <div style={{ padding: 16, background: 'var(--card-2)', borderBottom: attributes.length > 0 ? '1px solid var(--divider)' : 'none' }}>
              <label htmlFor="new-profile-attribute" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>属性名</label>
              <input
                id="new-profile-attribute"
                name="newProfileAttributeName"
                autoComplete="off"
                className="form-control"
                placeholder="例: 3年生、経済学部…"
                value={name}
                maxLength={20}
                aria-invalid={create.isError}
                onChange={event => setName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && name.trim()) create.mutate()
                  if (event.key === 'Escape') cancelAdding()
                }}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <ColorPicker value={color} onChange={setColor} />
              {create.error && <p role="alert" style={{ margin: '6px 0 0', color: 'var(--red-text)', fontSize: 12 }}>{create.error.message}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn" onClick={cancelAdding}>キャンセル</button>
                <button type="button" className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? '追加中…' : '追加'}
                </button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>読み込み中…</div>
          ) : error ? (
            <div role="alert" style={{ padding: 20, color: 'var(--red-text)', fontSize: 13 }}>{error.message}</div>
          ) : attributes.length === 0 && !adding ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>属性はまだありません。</div>
          ) : attributes.map((attribute, index) => (
            <div key={attribute.id} style={{ borderBottom: index < attributes.length - 1 ? '1px solid var(--divider)' : 'none' }}>
              <AttributeRow attribute={attribute} canManage={isAdmin} onChanged={() => { void invalidate() }} />
            </div>
          ))}
        </div>
        {!isAdmin && <p style={{ margin: '10px 0 0', color: 'var(--text-4)', fontSize: 12 }}>属性の追加・編集・削除は管理者が行います。</p>}
      </section>
    </div>
  )
}
