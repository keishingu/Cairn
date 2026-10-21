// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cardActionErrorMessage, normalizeModalView, viewFieldErrorMessage, type RenderInputElement, type RenderModal, type RenderModalBlock } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Modal } from '@/components/app/primitives'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { AppViewDto } from '@/app/api/app-views/route'
import { CardBlock } from './message-card'

// アプリが開いたモーダル（views.open）を出す。アプリが開くと Realtime で本人のトピックへ app_views の変化が届き、
// 一覧を取り直していちばん新しいものを出す（docs/app-platform-design.md §5.5）

export const APP_VIEWS_QUERY_KEY = ['app-views'] as const

type FieldError = { code?: string; message?: string }
type Values = Record<string, Record<string, string>>

async function fetchAppViews(): Promise<AppViewDto[]> {
  const res = await fetchWithAuth('/api/app-views')
  if (!res.ok) throw new Error(`app-views ${res.status}`)
  return res.json()
}

export function AppModalHost() {
  const t = useT()
  const query = useQuery({ queryKey: APP_VIEWS_QUERY_KEY, queryFn: fetchAppViews })
  const current = query.data?.[0]
  // 送信の前にアプリが views.update した場合、作り直したモーダルに理由を出す
  const [changedNotice, setChangedNotice] = React.useState<{ viewId: string; message: string } | null>(null)
  if (query.isError) {
    // 開いたはずのモーダルを黙って出さないままにしない
    return (
      <div role="alert" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 60, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--red-text)' }}>
        {t('This form is no longer available.')}
      </div>
    )
  }
  if (!current) return null
  // 差し替え（views.update）で中身が変わったら入力状態を作り直す
  return (
    <AppModal
      key={`${current.id}:${current.hash}`}
      dto={current}
      initialFormError={changedNotice?.viewId === current.id ? changedNotice.message : null}
      onViewChanged={(message) => setChangedNotice({ viewId: current.id, message })}
    />
  )
}

function initialValues(modal: RenderModal | null): Values {
  const values: Values = {}
  for (const block of modal?.blocks ?? []) {
    if (block.type !== 'input') continue
    values[block.blockId] = { [block.element.actionId]: block.element.initialValue ?? '' }
  }
  return values
}

function AppModal({ dto, initialFormError, onViewChanged }: { dto: AppViewDto; initialFormError: string | null; onViewChanged: (message: string) => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const modal = React.useMemo(() => normalizeModalView(dto.view), [dto.view])
  const [values, setValues] = React.useState<Values>(() => initialValues(modal))
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, FieldError>>({})
  const [formError, setFormError] = React.useState<string | null>(initialFormError)
  const [submitting, setSubmitting] = React.useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: APP_VIEWS_QUERY_KEY })

  const close = async () => {
    setFormError(null)
    try {
      const res = await fetchWithAuth(`/api/app-views/${dto.id}/close`, { method: 'POST' })
      // すでに閉じられた・使えなくなったモーダルは、取り直せば消える
      if (!res.ok && res.status !== 404) {
        setFormError(t('Could not close the form. Please try again.'))
        return
      }
    } catch {
      setFormError(t('Could not close the form. Please try again.'))
      return
    }
    await refresh()
  }

  const submit = async () => {
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})
    try {
      const res = await fetchWithAuth(`/api/app-views/${dto.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: dto.hash, values }),
      })
      const body = (await res.json().catch(() => null)) as { status?: string; errors?: Record<string, FieldError>; error?: string } | null
      if (res.status === 422 && body?.errors) {
        setFieldErrors(body.errors)
        return
      }
      if (!res.ok) {
        const message = t(cardActionErrorMessage(body?.error))
        if (body?.error === 'view_changed') {
          // 新しい版を取り直すとモーダルが作り直されるので、理由はホストに預ける
          onViewChanged(message)
          await refresh()
          return
        }
        setFormError(message)
        return
      }
      await refresh()
    } catch {
      setFormError(t(cardActionErrorMessage(null)))
    } finally {
      setSubmitting(false)
    }
  }

  const title = modal?.title ?? dto.appName
  return (
    <Modal onClose={() => void close()} label={title}>
      <div className="card" style={{ width: 480, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{dto.appName}</div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        </div>
        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!modal ? (
            <div role="alert" style={{ fontSize: 12.5, color: 'var(--red-text)' }}>{t('This form cannot be shown in this version. Reload the page to see it.')}</div>
          ) : (
            <>
              {modal.blocks.map((block) => (
                <ModalBlock
                  key={block.blockId}
                  block={block}
                  value={block.type === 'input' ? values[block.blockId]?.[block.element.actionId] ?? '' : ''}
                  error={fieldErrors[block.blockId]}
                  onChange={(next) => {
                    if (block.type !== 'input') return
                    setValues((prev) => ({ ...prev, [block.blockId]: { [block.element.actionId]: next } }))
                  }}
                />
              ))}
              {modal.hasUnsupported && (
                <div role="note" style={{ fontSize: 12, color: 'var(--text-3)', border: '1px dashed var(--border-2)', borderRadius: 6, padding: '6px 8px' }}>
                  {t('Part of this form cannot be shown in this version, so it cannot be submitted. Reload the page to see it.')}
                </div>
              )}
            </>
          )}
          {formError && <div role="alert" style={{ fontSize: 12, color: 'var(--red-text)' }}>{formError}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => void close()} disabled={submitting}>{modal?.close ?? t('Cancel')}</button>
          {modal?.submit && (
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting || modal.hasUnsupported}>
              {submitting ? t('Submitting...') : modal.submit}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ModalBlock({ block, value, error, onChange }: { block: RenderModalBlock; value: string; error: FieldError | undefined; onChange: (value: string) => void }) {
  const t = useT()
  // モーダル内のボタン（block_actions）は第1段階では押せない表示にする
  if (block.type !== 'input') return <CardBlock block={block} />
  const id = `app-modal-${block.blockId}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        {block.label}
        {block.optional && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: 'var(--text-3)' }}>{t('Optional')}</span>}
      </label>
      <InputElement id={id} element={block.element} value={value} invalid={!!error} onChange={onChange} />
      {block.hint && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{block.hint}</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--red-text)' }}>{viewFieldErrorMessage(error, t)}</div>}
    </div>
  )
}

function InputElement({ id, element, value, invalid, onChange }: { id: string; element: RenderInputElement; value: string; invalid: boolean; onChange: (value: string) => void }) {
  const t = useT()
  const style: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `1px solid ${invalid ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8,
    background: 'var(--card)', color: 'var(--text)', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit',
  }
  if (element.type === 'static_select') {
    return (
      <select id={id} value={value} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} style={style}>
        <option value="">{element.placeholder ?? t('Choose an option')}</option>
        {element.options.map((option) => (
          <option key={option.value} value={option.value} title={option.description}>
            {option.description ? `${option.text} — ${option.description}` : option.text}
          </option>
        ))}
      </select>
    )
  }
  const common = {
    id,
    value,
    'aria-invalid': invalid,
    placeholder: element.placeholder,
    maxLength: element.maxLength,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    style,
  }
  return element.multiline ? <textarea rows={4} {...common} style={{ ...style, resize: 'vertical' }} /> : <input type="text" {...common} />
}
