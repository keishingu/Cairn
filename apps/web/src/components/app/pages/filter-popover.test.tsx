import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterPopover } from './filter-popover'

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

afterEach(() => {
  if (scrollIntoViewDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('FilterPopover', () => {
  it('長い候補を画面内でスクロールでき、矢印操作で末尾まで移動して選べる', () => {
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
        <>
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
        </>
      )
    }

    render(<TestPopover />)

    const popover = [...document.body.children].find(element => (element as HTMLElement).style.position === 'fixed') as HTMLElement
    expect(popover).toHaveStyle({ position: 'fixed', overflowY: 'auto', maxHeight: '480px' })
    expect(popover.parentElement).toBe(document.body)

    for (let index = 0; index < members.length; index++) {
      fireEvent.keyDown(window, { code: 'ArrowDown' })
    }
    fireEvent.keyDown(window, { code: 'Space' })

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(onChangeMembers).toHaveBeenLastCalledWith(['メンバー40'])

    fireEvent.click(screen.getByText('メンバー40').closest('label')!.querySelector('input')!)
    expect(onChangeMembers).toHaveBeenLastCalledWith([])

    fireEvent.click(screen.getByRole('checkbox', { name: '進行中' }))
    expect(onChange).toHaveBeenLastCalledWith(['進行中'])
    fireEvent.click(screen.getByRole('button', { name: 'すべてクリア' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(onChangeMembers).toHaveBeenLastCalledWith([])
  })
})
