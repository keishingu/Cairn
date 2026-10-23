import { describe, expect, it } from 'vitest'
import { createThemePalette } from './theme'

describe('ネイティブ外観テーマ', () => {
  it('Webと同じアクセント色をテーマ別に返す', () => {
    expect(createThemePalette('light', 'violet').accent).toBe('#8B5CF6')
    expect(createThemePalette('dark', 'violet').accent).toBe('#A78BFA')
  })

  it('アクセントを変えても背景トークンは維持する', () => {
    expect(createThemePalette('dark', 'cyan').bg).toBe('#0B0F14')
  })
})
