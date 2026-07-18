// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { thumbnailStoragePath } from './thumbnail'

describe('thumbnailStoragePath', () => {
  it('同じ階層の thumb/ 配下に拡張子 .jpg で配置する', () => {
    expect(thumbnailStoragePath('ws1/ch1/abc.png')).toBe('ws1/ch1/thumb/abc.jpg')
  })

  it('拡張子が無いパスでもそのままステムを使う', () => {
    expect(thumbnailStoragePath('ws1/ch1/abc')).toBe('ws1/ch1/thumb/abc.jpg')
  })

  it('ディレクトリが無いパスでも thumb/ を付与する', () => {
    expect(thumbnailStoragePath('abc.jpeg')).toBe('thumb/abc.jpg')
  })
})
