'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import {
  useCreateProfileAttribute,
  useDeleteProfileAttribute,
  useProfileAttributes,
  useUpdateProfileAttribute,
} from '@/hooks/use-profile-attributes'
import { ConfirmDialog } from './confirm-dialog'
import { RowActionMenu } from './row-action-menu'
import {
  PROFILE_ATTRIBUTE_COLOR_OPTIONS,
  ProfileAttributeBadges,
} from './profile-attribute-badges'

function ColorPicker({
  value,
  onChange,
}: {
  value: ProfileAttributeColor
  onChange: (value: ProfileAttributeColor) => void
}) {
  const t = useT()
  return (
    <div role="group" aria-label={t('Label color')} style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {PROFILE_ATTRIBUTE_COLOR_OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          className="btn btn-ghost"
          aria-label={t(option.label)}
          aria-pressed={value === option.id}
          title={t(option.label)}
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
}: {
  attribute: ProfileAttributeDto
  canManage: boolean
}) {
  const t = useT()
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [name, setName] = React.useState(attribute.name)
  const [color, setColor] = React.useState(attribute.color)

  React.useEffect(() => {
    setName(attribute.name)
    setColor(attribute.color)
  }, [attribute.name, attribute.color])

  const update = useUpdateProfileAttribute(attribute.id)
  const remove = useDeleteProfileAttribute(attribute.id)

  const handleCancelEditing = () => {
    setName(attribute.name)
    setColor(attribute.color)
    setEditing(false)
    update.reset()
  }
  const handleUpdate = () => {
    update.mutate({ name: name.trim(), color }, {
      onSuccess: () => {
        setEditing(false)
      },
    })
  }

  if (editing) {
    return (
      <div style={{ padding: 16, background: 'var(--card-2)' }}>
        <label htmlFor={`profile-attribute-${attribute.id}`} style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
          {t('Attribute name')}
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
            if (event.key === 'Enter' && name.trim()) handleUpdate()
            if (event.key === 'Escape') handleCancelEditing()
          }}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <ColorPicker value={color} onChange={setColor} />
        {update.error && <p role="alert" style={{ margin: '6px 0 0', color: 'var(--red-text)', fontSize: 12 }}>{update.error.message}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn" onClick={handleCancelEditing}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim() || update.isPending} onClick={handleUpdate}>
            {update.isPending ? t('Saving...') : t('Save')}
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
          { icon: 'edit', label: 'Edit', onSelect: () => { setName(attribute.name); setColor(attribute.color); update.reset(); setEditing(true) } },
          { icon: 'trash', label: 'Delete', danger: true, onSelect: () => setConfirmDelete(true) },
        ]} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t('Delete attribute')}
        message={t('Delete "{name}". It is also removed from every member who has it.', { name: attribute.name })}
        onConfirm={() => remove.mutateAsync()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export function ProfileAttributesSettings() {
  const t = useT()
  const { isAdmin } = useWorkspacePermissions()
  const { data: attributes = [], isLoading, error } = useProfileAttributes()
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState<ProfileAttributeColor>('slate')
  const create = useCreateProfileAttribute()
  const cancelAdding = () => {
    setName('')
    setColor('slate')
    setAdding(false)
    create.reset()
  }

  const handleCreate = () => {
    create.mutate({ name: name.trim(), color }, {
      onSuccess: () => {
        setName('')
        setColor('slate')
        setAdding(false)
      },
    })
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('Profile attributes')}</h1>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
            {t('Manage shared labels and colors for members. Attributes are shared across every project in the workspace.')}
          </p>
        </div>
        {isAdmin && !adding && (
          <button type="button" className="btn btn-primary" onClick={() => { create.reset(); setAdding(true) }} style={{ flexShrink: 0 }}>
            {t('Add attribute')}
          </button>
        )}
      </div>

      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Attribute list')}</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {adding && (
            <div style={{ padding: 16, background: 'var(--card-2)', borderBottom: attributes.length > 0 ? '1px solid var(--divider)' : 'none' }}>
              <label htmlFor="new-profile-attribute" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>{t('Attribute name')}</label>
              <input
                id="new-profile-attribute"
                name="newProfileAttributeName"
                autoComplete="off"
                className="form-control"
                placeholder={t('e.g. 3rd year, economics…')}
                value={name}
                maxLength={20}
                aria-invalid={create.isError}
                onChange={event => setName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && name.trim()) handleCreate()
                  if (event.key === 'Escape') cancelAdding()
                }}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <ColorPicker value={color} onChange={setColor} />
              {create.error && <p role="alert" style={{ margin: '6px 0 0', color: 'var(--red-text)', fontSize: 12 }}>{create.error.message}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn" onClick={cancelAdding}>{t('Cancel')}</button>
                <button type="button" className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={handleCreate}>
                  {create.isPending ? t('Adding...') : t('Add')}
                </button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{t('Loading...')}</div>
          ) : error ? (
            <div role="alert" style={{ padding: 20, color: 'var(--red-text)', fontSize: 13 }}>{error.message}</div>
          ) : attributes.length === 0 && !adding ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{t('No attributes yet.')}</div>
          ) : attributes.map((attribute, index) => (
            <div key={attribute.id} style={{ borderBottom: index < attributes.length - 1 ? '1px solid var(--divider)' : 'none' }}>
              <AttributeRow attribute={attribute} canManage={isAdmin} />
            </div>
          ))}
        </div>
        {!isAdmin && <p style={{ margin: '10px 0 0', color: 'var(--text-4)', fontSize: 12 }}>{t('Only admins can add, edit, or delete attributes.')}</p>}
      </section>
    </div>
  )
}
