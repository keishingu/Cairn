'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectRoleDto } from '@/app/api/projects/roles/route'
import { useT } from '@/components/locale-provider'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { useProjectRoles } from '@/hooks/use-project-roles'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { ConfirmDialog } from './confirm-dialog'
import { Icon } from './primitives'
import { RowActionMenu } from './row-action-menu'

const COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#F43F5E',
  '#6B7280',
  '#EF4444',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#14B8A6',
]

async function apiError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return data.error ?? fallback
}

const ColorPicker = ({ value, onChange }: { value: string; onChange: (color: string) => void }) => {
  const t = useT()
  return (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
    {COLORS.map((color) => (
      <button
        key={color}
        type="button"
        aria-label={t('Color {color}', { color })}
        aria-pressed={value === color}
        onClick={() => onChange(color)}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: color,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          outline: value === color ? `3px solid ${color}` : undefined,
          outlineOffset: 2,
        }}
      />
    ))}
  </div>
  )
}

const RoleRow = ({ role, canEdit }: { role: ProjectRoleDto; canEdit: boolean }) => {
  const t = useT()
  const queryClient = useQueryClient()
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [name, setName] = React.useState(role.name)
  const [color, setColor] = React.useState(role.color)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['project-roles'] })

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (!res.ok) throw new Error(await apiError(res, t('Could not update')))
    },
    onSuccess: async () => {
      setEditing(false)
      await invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/projects/roles/${role.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await apiError(res, t('Could not delete')))
    },
    onSuccess: async () => {
      setConfirmDelete(false)
      await invalidate()
    },
  })

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: role.color,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>{role.name}</span>
        {role.isDefault && (
          <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{t('Default for new members')}</span>
        )}
        {canEdit && (
          <RowActionMenu
            actions={[
              { icon: 'edit', label: 'Edit', onSelect: () => setEditing(true) },
              ...(!role.isDefault
                ? [
                    {
                      icon: 'trash',
                      label: 'Delete',
                      danger: true,
                      onSelect: () => setConfirmDelete(true),
                    },
                  ]
                : []),
            ]}
          />
        )}
        <ConfirmDialog
          open={confirmDelete}
          title={t('Delete role')}
          message={t('Delete role "{name}"? You cannot delete a role that is in use.', { name: role.name })}
          onConfirm={() => remove.mutateAsync()}
          onClose={() => setConfirmDelete(false)}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--card-2)',
      }}
    >
      <input
        aria-label={t('Role name')}
        name="roleName"
        autoComplete="off"
        value={name}
        maxLength={30}
        onChange={(event) => setName(event.target.value)}
        style={{
          height: 32,
          padding: '0 10px',
          border: '1px solid var(--border)',
          borderRadius: 7,
          background: 'var(--card)',
          color: 'var(--text)',
          fontSize: 12.5,
          fontFamily: 'inherit',
        }}
      />
      <ColorPicker value={color} onChange={setColor} />
      {save.error && (
        <div role="alert" style={{ fontSize: 11.5, color: 'var(--red-text)' }}>
          {save.error.message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-ghost"
          style={{ height: 28, fontSize: 12 }}
          onClick={() => setEditing(false)}
        >
          {t('Cancel')}
        </button>
        <button
          className="btn btn-primary"
          style={{ height: 28, fontSize: 12 }}
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t('Saving...') : t('Save')}
        </button>
      </div>
    </div>
  )
}

export const SettingsProjectRoles = () => {
  const t = useT()
  const { isAdmin } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const { data: roles = [], isLoading, error } = useProjectRoles()
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState('#3B82F6')
  const add = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/projects/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (!res.ok) throw new Error(await apiError(res, t('Could not add')))
    },
    onSuccess: async () => {
      setAdding(false)
      setName('')
      setColor('#3B82F6')
      await queryClient.invalidateQueries({ queryKey: ['project-roles'] })
    },
  })

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
        {t('Roles')}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        {t('Manage roles for project members.')}
      </p>
      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Role list')}</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              {t('Loading...')}
            </div>
          )}
          {error && (
            <div role="alert" style={{ padding: 20, color: 'var(--red-text)', fontSize: 12 }}>
              {t('Could not load roles')}
            </div>
          )}
          {roles.map((role, index) => (
            <div
              key={role.id}
              style={{
                borderBottom:
                  index < roles.length - 1 || adding ? '1px solid var(--divider)' : 'none',
              }}
            >
              <RoleRow role={role} canEdit={isAdmin} />
            </div>
          ))}
          {adding ? (
            <div
              style={{
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: 'var(--card-2)',
              }}
            >
              <input
                aria-label={t('New role name')}
                name="newRoleName"
                autoComplete="off"
                maxLength={30}
                value={name}
                placeholder={t('Enter a role name…')}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && name.trim()) add.mutate()
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                }}
              />
              <ColorPicker value={color} onChange={setColor} />
              {add.error && (
                <div role="alert" style={{ fontSize: 11.5, color: 'var(--red-text)' }}>
                  {add.error.message}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-ghost"
                  style={{ height: 28, fontSize: 12 }}
                  onClick={() => {
                    setAdding(false)
                    setName('')
                  }}
                >
                  {t('Cancel')}
                </button>
                <button
                  className="btn btn-primary"
                  style={{ height: 28, fontSize: 12 }}
                  disabled={!name.trim() || add.isPending}
                  onClick={() => add.mutate()}
                >
                  {add.isPending ? t('Adding...') : t('Add')}
                </button>
              </div>
            </div>
          ) : isAdmin ? (
            <div
              style={{
                padding: 10,
                borderTop: roles.length > 0 ? '1px solid var(--divider)' : 'none',
              }}
            >
              <button
                onClick={() => setAdding(true)}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px dashed var(--border-2)',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Icon name="plus" size={13} /> {t('Add a role')}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
