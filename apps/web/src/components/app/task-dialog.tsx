'use client'

import React from 'react'
import { Modal, ModalHeader } from './primitives'

interface TaskDialogAction {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

interface TaskDialogProps {
  title: string
  subtitle?: string
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  children: React.ReactNode
  errorMessage?: string
  submitLabel: string
  submittingLabel: string
  isSubmitting: boolean
  submitDisabled?: boolean
  leadingAction?: TaskDialogAction
  disableClose?: boolean
}

export const TaskDialog = ({
  title,
  subtitle,
  onClose,
  onSubmit,
  children,
  errorMessage,
  submitLabel,
  submittingLabel,
  isSubmitting,
  submitDisabled = false,
  leadingAction,
  disableClose = false,
}: TaskDialogProps) => {
  const handleClose = () => {
    if (disableClose) return
    onClose()
  }

  const headerProps = subtitle ? { subtitle } : {}

  return (
    <Modal onClose={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative',
          background: 'var(--card)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 480,
          maxHeight: 'calc(100dvh - 48px)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeSlideIn .15s ease',
        }}
      >
        <ModalHeader title={title} onClose={handleClose} {...headerProps} />
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            data-task-dialog-body
            style={{
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
          >
            {children}
          </div>
          {errorMessage && (
            <div
              role="alert"
              style={{
                fontSize: 12.5,
                color: 'var(--red-text)',
                background: 'var(--red-soft)',
                padding: '8px 12px',
                margin: '0 20px 12px',
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              {errorMessage}
            </div>
          )}
          <div
            data-task-dialog-actions
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              padding: '16px 20px 20px',
              borderTop: '1px solid var(--divider)',
              flexShrink: 0,
              background: 'var(--card)',
            }}
          >
            <div>
              {leadingAction && (
                <button
                  type="button"
                  className={leadingAction.className ?? 'btn'}
                  onClick={leadingAction.onClick}
                  disabled={leadingAction.disabled}
                >
                  {leadingAction.label}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleClose} className="btn" disabled={disableClose}>
                キャンセル
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitDisabled || isSubmitting}
              >
                {isSubmitting ? submittingLabel : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  )
}
