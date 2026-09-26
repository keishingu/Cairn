// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { Modal, ModalHeader } from './primitives'

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'discriminatory', label: 'Discriminatory or hostile' },
  { value: 'sexual', label: 'Sexual or inappropriate' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['value']

interface ReportMessageDialogProps {
  open: boolean
  /** reject したらダイアログを開いたままエラーを表示する */
  onSubmit: (input: { reason: ReportReason; details?: string }) => Promise<void>
  onClose: () => void
}

// メッセージ報告のダイアログ。ブラウザ標準の prompt では番号入力になり、理由の選択を誤りやすいため自前で出す
export const ReportMessageDialog = ({ open, onSubmit, onClose }: ReportMessageDialogProps) => {
  const t = useT()
  const [reason, setReason] = React.useState<ReportReason | null>(null)
  const [details, setDetails] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) { setReason(null); setDetails(''); setBusy(false); setError(null) }
  }, [open])

  if (!open) return null

  const trimmedDetails = details.trim()
  const canSubmit = reason !== null && (reason !== 'other' || trimmedDetails.length > 0) && !busy
  const close = () => { if (!busy) onClose() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !reason) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ reason, ...(trimmedDetails ? { details: trimmedDetails } : {}) })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not report the message'))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={close}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('Report message')}
        className="card"
        onSubmit={submit}
        style={{ position: 'relative', width: 420, maxWidth: '90vw', padding: 0, boxShadow: 'var(--shadow-lg)' }}
      >
        <ModalHeader icon="flag" title={t('Report message')} onClose={close} />
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
            {t('Choose why you are reporting this message. The moderators will review it.')}
          </p>
          <div role="radiogroup" aria-label={t('Report reason')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {REPORT_REASONS.map(option => (
              <label
                key={option.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  color: 'var(--text)',
                  background: reason === option.value ? 'var(--accent-soft)' : 'transparent',
                  border: `1px solid ${reason === option.value ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  style={{ accentColor: 'var(--accent)', margin: 0 }}
                />
                {t(option.label)}
              </label>
            ))}
          </div>
          {reason === 'other' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
              {t('Details')}
              <textarea
                className="form-control"
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder={t('Describe what happened')}
                rows={3}
                autoFocus
              />
            </label>
          )}
          {error && (
            <div role="alert" style={{ fontSize: 12, color: 'var(--red-text)', padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)' }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--divider)' }}>
          <button type="button" className="btn" onClick={close} disabled={busy}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-danger" disabled={!canSubmit}>
            {busy ? t('Reporting...') : t('Submit report')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
