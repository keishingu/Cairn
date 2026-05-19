import { describe, expect, it, vi } from 'vitest'

const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

describe('RootPage', () => {
  it('/projects にリダイレクトする', async () => {
    const { default: RootPage } = await import('./page')
    RootPage()
    expect(mockRedirect).toHaveBeenCalledWith('/projects')
  })
})
