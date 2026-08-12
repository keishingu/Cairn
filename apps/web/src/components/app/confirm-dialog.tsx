'use client'

import React from 'react'
import { Icon, Modal } from './primitives'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  busyLabel?: string
  confirmDisabled?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

// 削除などの破壊的操作の確認ダイアログ。onConfirm が reject した場合は
// ダイアログを開いたままエラーメッセージを表示する
export const ConfirmDialog = ({
  open, title, message,
  confirmLabel = '削除する', busyLabel = '削除中…',
  confirmDisabled = false,
  onConfirm, onClose,
}: ConfirmDialogProps) => {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) { setBusy(false); setError(null) }
  }, [open])

  if (!open) return null

  const close = () => { if (!busy) onClose() }

  const handleConfirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作に失敗しました')
      setBusy(false)
    }
  }

  return (
    <Modal onClose={close}>
      <div className="card" style={{ position: 'relative', width: 380, maxWidth: '90vw', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--red-soft)', color: 'var(--red-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="alertTriangle" size={16}/>
          </div>
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16, overflowWrap: 'break-word' }}>{message}</div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--red-text)', padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)', marginBottom: 12 }}>
            ⚠ {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={close} disabled={busy}>キャンセル</button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={busy || confirmDisabled} style={{ opacity: busy || confirmDisabled ? 0.7 : 1 }}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
