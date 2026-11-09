import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmDiscardUnsavedChanges, hasUnsavedChanges, useUnsavedChanges } from './use-unsaved-changes'

const Probe = ({ dirty }: { dirty: boolean }) => {
  useUnsavedChanges(dirty)
  return null
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('未保存の変更のガード（useUnsavedChanges）', () => {
  it('dirty の間だけ登録され、false に戻ると解除される', () => {
    const { rerender } = render(<Probe dirty={false} />)
    expect(hasUnsavedChanges()).toBe(false)
    rerender(<Probe dirty />)
    expect(hasUnsavedChanges()).toBe(true)
    rerender(<Probe dirty={false} />)
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('アンマウントでも解除される', () => {
    const { unmount } = render(<Probe dirty />)
    expect(hasUnsavedChanges()).toBe(true)
    unmount()
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('dirty の間だけ beforeunload を止める', () => {
    const { rerender } = render(<Probe dirty />)
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    rerender(<Probe dirty={false} />)
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })

  it('未保存がなければ確認せずに true を返す', () => {
    const confirm = vi.spyOn(window, 'confirm')
    expect(confirmDiscardUnsavedChanges('破棄しますか？')).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('未保存があれば確認し、承諾なら true・拒否なら false を返す', () => {
    render(<Probe dirty />)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    expect(confirmDiscardUnsavedChanges('破棄しますか？')).toBe(false)
    expect(confirmDiscardUnsavedChanges('破棄しますか？')).toBe(true)
    expect(confirm).toHaveBeenCalledWith('破棄しますか？')
  })

  it('複数の編集欄のうち1つでも dirty なら登録されたまま', () => {
    const a = render(<Probe dirty />)
    render(<Probe dirty />)
    a.unmount()
    expect(hasUnsavedChanges()).toBe(true)
  })

  describe('内部リンクのクリック', () => {
    const clickLink = (attrs: Record<string, string>, init: MouseEventInit = {}) => {
      const a = document.createElement('a')
      for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
      a.textContent = 'リンク'
      document.body.appendChild(a)
      // jsdom は遷移しないが、既定動作が止められたかを見るため一度だけ dispatch する
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
      a.dispatchEvent(event)
      a.remove()
      return event
    }

    it('dirty のとき内部リンクは確認し、拒否すれば遷移を止める', () => {
      render(<Probe dirty />)
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const event = clickLink({ href: '/tasks' })
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(true)
    })

    it('承諾すれば遷移を止めない', () => {
      render(<Probe dirty />)
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      expect(clickLink({ href: '/tasks' }).defaultPrevented).toBe(false)
    })

    it('外部リンク・別タブ・ダウンロード・ハッシュのみ・修飾キー付きは確認しない', () => {
      render(<Probe dirty />)
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      clickLink({ href: 'https://example.com/x' })
      clickLink({ href: '/tasks', target: '_blank' })
      clickLink({ href: '/file.pdf', download: '' })
      clickLink({ href: '#section' })
      clickLink({ href: '/tasks' }, { ctrlKey: true })
      clickLink({ href: '/tasks', 'data-skip-unsaved-guard': '' })
      expect(confirm).not.toHaveBeenCalled()
    })

    it('dirty でなければ確認せず、リスナーも外れている', () => {
      const { rerender } = render(<Probe dirty />)
      rerender(<Probe dirty={false} />)
      const confirm = vi.spyOn(window, 'confirm')
      clickLink({ href: '/tasks' })
      expect(confirm).not.toHaveBeenCalled()
    })
  })
})
