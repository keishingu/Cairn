import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCommandDispatcher } from '@/hooks/use-command-dispatcher'
import { CommandProvider, useCommand } from '@/lib/command-registry'
import { FilterPopover } from './filter-popover'

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  if (scrollIntoViewDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('FilterPopover', () => {
  it('長い候補を画面内でスクロールでき、矢印操作とTabで末尾と一括解除へ移動できる', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 160 })
    const onChange = vi.fn()
    const onChangeMembers = vi.fn()
    const anchorRef = React.createRef<HTMLDivElement>()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const members = Array.from({ length: 40 }, (_, index) => `メンバー${index + 1}`)
    const statuses = [{ id: 'status-1', name: '進行中', color: '#3b82f6', sortOrder: '0' }]
    const TestPopover = () => {
      const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([])
      const [selectedMembers, setSelectedMembers] = React.useState<string[]>([])
      return (
        <div className="app-root">
          <div ref={anchorRef}><button>フィルター</button></div>
          <FilterPopover
            containerRef={anchorRef}
            allStatuses={statuses}
            selected={selectedStatuses}
            onChange={next => { onChange(next); setSelectedStatuses(next) }}
            allMembers={members}
            selectedMembers={selectedMembers}
            onChangeMembers={next => { onChangeMembers(next); setSelectedMembers(next) }}
            onClose={vi.fn()}
          />
        </div>
      )
    }

    render(<TestPopover />)

    const popover = document.querySelector('.app-root > div[style*="position: fixed"]') as HTMLElement
    expect(popover).toHaveStyle({ position: 'fixed', overflowY: 'auto', maxHeight: '480px' })
    expect(Number.parseFloat(popover.style.left) + Number.parseFloat(popover.style.width)).toBeLessThanOrEqual(160)
    expect(popover.parentElement).toHaveClass('app-root')
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: '進行中' }))

    for (let index = 0; index < members.length; index++) {
      await user.keyboard('{ArrowDown}')
    }
    await user.keyboard(' ')

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(onChangeMembers).toHaveBeenLastCalledWith(['メンバー40'])

    await user.click(screen.getByText('メンバー40').closest('label')!.querySelector('input')!)
    expect(onChangeMembers).toHaveBeenLastCalledWith([])

    await user.click(screen.getByRole('checkbox', { name: '進行中' }))
    expect(onChange).toHaveBeenLastCalledWith(['進行中'])
    for (let index = 0; index <= members.length; index++) await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'すべてクリア' }))
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(onChangeMembers).toHaveBeenLastCalledWith([])
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: '進行中' }))
  })

  it('空で開いた後に候補が届くとフォーカスし、外へ移動した後は奪わずEscapeで閉じる', async () => {
    const user = userEvent.setup()
    const anchorRef = React.createRef<HTMLDivElement>()
    let updateMembers!: (members: string[]) => void
    const AsyncPopover = () => {
      const [open, setOpen] = React.useState(false)
      const [members, setMembers] = React.useState<string[]>([])
      updateMembers = setMembers
      return (
        <div className="app-root">
          <div ref={anchorRef}><button onClick={() => setOpen(true)}>フィルターを開く</button></div>
          <button>外部ボタン</button>
          {open && <FilterPopover
            containerRef={anchorRef}
            allStatuses={[]}
            selected={[]}
            onChange={vi.fn()}
            allMembers={members}
            onChangeMembers={vi.fn()}
            onClose={() => setOpen(false)}
          />}
        </div>
      )
    }

    render(<AsyncPopover />)
    const trigger = screen.getByRole('button', { name: 'フィルターを開く' })
    await user.click(trigger)
    const popover = document.querySelector('.app-root > .app[style*="position: fixed"]')!
    await waitFor(() => expect(document.activeElement).toBe(popover))

    act(() => updateMembers(['メンバーA']))
    const firstChoice = screen.getByText('メンバーA').closest('label')!.querySelector('input')!
    await waitFor(() => expect(document.activeElement).toBe(firstChoice))

    const outside = screen.getByRole('button', { name: '外部ボタン' })
    outside.focus()
    act(() => updateMembers(['メンバーA', 'メンバーB']))
    await waitFor(() => expect(screen.getByText('メンバーB')).toBeInTheDocument())
    expect(document.activeElement).toBe(outside)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.querySelector('.app-root > .app[style*="position: fixed"]')).toBeNull())
    expect(document.activeElement).toBe(outside)
  })

  it('Alt+Fでチェックボックスにフォーカスした状態からポップアップを閉じる', async () => {
    const user = userEvent.setup()
    const anchorRef = React.createRef<HTMLDivElement>()
    const onToggle = vi.fn()
    const ShortcutHarness = () => {
      const [open, setOpen] = React.useState(false)
      useCommandDispatcher({ page: 'projects' })
      useCommand('ctx.filter', () => {
        onToggle()
        setOpen(value => !value)
      })
      return (
        <div className="app-root">
          <div ref={anchorRef}><button>フィルターを開く</button></div>
          {open && <FilterPopover
            containerRef={anchorRef}
            allStatuses={[{ id: 'status-1', name: '進行中', color: '#3b82f6', sortOrder: '0' }]}
            selected={[]}
            onChange={vi.fn()}
            onClose={() => setOpen(false)}
          />}
        </div>
      )
    }

    render(<CommandProvider><ShortcutHarness /></CommandProvider>)
    await user.keyboard('{Alt>}f{/Alt}')
    expect(onToggle).toHaveBeenCalledOnce()
    const checkbox = await screen.findByRole('checkbox', { name: '進行中' })
    await waitFor(() => expect(document.activeElement).toBe(checkbox))

    fireEvent.keyDown(checkbox, { code: 'KeyF', key: 'f', altKey: true, shiftKey: true })
    expect(screen.getByRole('checkbox', { name: '進行中' })).toBeInTheDocument()

    await user.keyboard('{Alt>}f{/Alt}')
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: '進行中' })).toBeNull())
    expect(onToggle).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'フィルターを開く' }))
  })
})
