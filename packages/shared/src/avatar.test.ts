import { describe, expect, test } from 'vitest'
import { AVATAR_GRADIENTS, avatarGradient, avatarInitial } from './avatar'

describe('avatarGradient', () => {
  test('同じ名前には常に同じ配色を返す', () => {
    expect(avatarGradient('山田 太郎')).toEqual(avatarGradient('山田 太郎'))
    expect(AVATAR_GRADIENTS).toContainEqual(avatarGradient('山田 太郎'))
  })

  test('空の名前でも配色を返す', () => {
    expect(avatarGradient('')).toEqual(AVATAR_GRADIENTS[0])
  })
})

describe('avatarInitial', () => {
  test('空白を除いた先頭1文字を大文字で返し、名前が無ければ ? にする', () => {
    expect(avatarInitial('taro yamada')).toBe('T')
    expect(avatarInitial(' 山田')).toBe('山')
    expect(avatarInitial('')).toBe('?')
    expect(avatarInitial('   ')).toBe('?')
  })
})
