import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
