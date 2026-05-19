import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HomePage from './page'

describe('HomePage', () => {
  it('準備中のメッセージを表示する', () => {
    render(<HomePage />)
    expect(screen.getByText('Cairn — 準備中')).toBeInTheDocument()
  })
})
