'use client'

import React from 'react'
import { Modal, ModalHeader } from './primitives'
import { useT } from '@/components/locale-provider'
import { useAppShell } from './app-shell-context'
import { MobileFormSheet } from './mobile/form-sheet'

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
  const t = useT()
  const handleClose = () => {
    if (disableClose) return
    onClose()
  }

  const headerProps = subtitle ? { subtitle } : {}
  const { isMobile } = useAppShell()

  // モバイルはプロジェクト作成と同じボトムシートで出す（中央モーダルだと入力欄が小さく、見た目も揃わない）
  if (isMobile) {
    return (
      <MobileFormSheet
        icon="check"
        title={title}
        subtitle={subtitle}
        onClose={onClose}
        onSubmit={onSubmit}
        submitLabel={submitLabel}
        submittingLabel={submittingLabel}
        isSubmitting={isSubmitting}
        submitDisabled={submitDisabled}
        disableClose={disableClose}
        errorMessage={errorMessage}
        leadingAction={leadingAction}
      >
        {children}
      </MobileFormSheet>
    )
  }

  return (
    <Modal onClose={handleClose} label={title}>
      <div
        data-task-dialog
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
                fontSize: 13,
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
                {t('Cancel')}
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
