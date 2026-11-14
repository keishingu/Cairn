'use client'

import React from 'react'
import { FormVariantContext, Icon, Modal } from '../primitives'
import { useT } from '@/components/locale-provider'

interface MobileFormSheetProps {
  icon: string
  title: string
  subtitle?: string | undefined
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  submitLabel: string
  submittingLabel: string
  isSubmitting: boolean
  submitDisabled?: boolean | undefined
  disableClose?: boolean | undefined
  errorMessage?: string | undefined
  leadingAction?: { label: string; onClick: () => void; disabled?: boolean | undefined } | undefined
  children: React.ReactNode
}

/**
 * iOS はソフトウェアキーボードを出しても window.innerHeight を縮めず、画面下に固定したシートの
 * フッター（作成・保存ボタン）がキーボードの裏に隠れる。visualViewport から隠れた高さを求めて持ち上げる
 */
function useKeyboardInset(): { inset: number; visibleHeight: number | null } {
  const [state, setState] = React.useState<{ inset: number; visibleHeight: number | null }>({ inset: 0, visibleHeight: null })
  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      // iOS は入力欄を見せるためにページ自体を送ることがあり、送り量によって固定配置の層の位置が変わる。
      // モバイルシェルはページ全体をスクロールさせない作りなので、シートを開いている間は常に先頭へ戻し、
      // 「画面の高さ − 見えている高さ」をそのままキーボードの高さとして扱えるようにする
      if (window.scrollY !== 0 || viewport.offsetTop !== 0) window.scrollTo(0, 0)
      setState({
        inset: Math.max(0, Math.round(window.innerHeight - viewport.height)),
        visibleHeight: Math.round(viewport.height),
      })
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return state
}

/**
 * モバイルの作成・編集フォームの共通ボトムシート。プロジェクト作成シートの見た目
 * （ドラッグハンドル・アイコン付き見出し・キャンセル1:作成2 の大きいボタン）を基準にし、
 * タスク作成なども同じ見た目に揃える。フォーカスの閉じ込め・Escape は Modal（Radix）に任せる。
 */
export function MobileFormSheet({
  icon,
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting,
  submitDisabled = false,
  disableClose = false,
  errorMessage,
  leadingAction,
  children,
}: MobileFormSheetProps) {
  const t = useT()
  const { inset: keyboardInset, visibleHeight } = useKeyboardInset()
  const handleClose = () => {
    if (disableClose) return
    onClose()
  }

  return (
    <Modal onClose={handleClose} label={title} placement="bottom">
      <div
        data-mobile-form-sheet
        style={{
          position: 'relative',
          background: 'var(--card)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          boxShadow: 'var(--shadow-sheet)',
          // キーボードが出ている間は見えている範囲に収め、フッターをキーボードの上に出す
          // 見出しが上に押し出されないよう、dvh ではなく実際に見えている高さで上限を決める
          maxHeight: keyboardInset > 0 && visibleHeight != null ? visibleHeight - 12 : '90dvh',
          marginBottom: keyboardInset,
          width: '100%',
          display: 'flex', flexDirection: 'column',
          animation: 'slideUpSheet .22s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }}/>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 14px', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={icon} size={16}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text)' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={handleClose}
            disabled={disableClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--card-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Icon name="close" size={15}/>
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            data-mobile-form-sheet-body
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            <FormVariantContext.Provider value="sheet">
              {children}
            </FormVariantContext.Provider>
          </div>

          {errorMessage && (
            <div
              role="alert"
              style={{ fontSize: 'var(--fs-md)', color: 'var(--red-text)', background: 'var(--red-soft)', padding: '8px 12px', margin: '8px 20px 0', borderRadius: 8, flexShrink: 0 }}
            >
              {errorMessage}
            </div>
          )}

          <div style={{
            padding: '12px 20px',
            paddingBottom: keyboardInset > 0 ? 12 : 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--divider)',
            display: 'flex', gap: 10,
            flexShrink: 0,
          }}>
            {leadingAction && (
              <button
                type="button"
                onClick={leadingAction.onClick}
                disabled={leadingAction.disabled}
                className="btn btn-lg"
                style={{ height: 46, borderRadius: 12, fontSize: 'var(--fs-xl)' }}
              >
                {leadingAction.label}
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              disabled={disableClose}
              className="btn btn-lg"
              style={{ flex: 1, height: 46, borderRadius: 12, fontSize: 'var(--fs-xl)' }}
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitDisabled || isSubmitting}
              className="btn btn-primary btn-lg"
              style={{ flex: 2, height: 46, borderRadius: 12, fontSize: 'var(--fs-xl)' }}
            >
              {isSubmitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
