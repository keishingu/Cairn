import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HomePage from './page'

describe('HomePage', () => {
  it('アプリのルート要素を描画する', () => {
    render(<HomePage />)
    expect(document.querySelector('.app-root')).toBeInTheDocument()
  })
})
