// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  galleryImagesOf,
  initialGallerySelection,
  MessageGalleryDialog,
  projectGalleryHref,
} from './message-gallery-dialog'

vi.mock('@/components/locale-provider', () => ({
  useT: () => (message: string, values?: Record<string, string | number>) =>
    values ? Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message) : message,
}))

const attachment = (fileId: string, mimeType: string | null) => ({ fileId, fileName: `${fileId}.bin`, mimeType })

describe('galleryImagesOf', () => {
  test('ギャラリーに置ける画像形式の添付だけを返す', () => {
    const images = galleryImagesOf([
      attachment('a', 'image/jpeg'),
      attachment('b', 'application/pdf'),
      attachment('c', 'image/svg+xml'),
      attachment('d', null),
      attachment('e', 'image/heic'),
    ])

    expect(images.map(image => image.fileId)).toEqual(['a', 'e'])
  })
})

describe('initialGallerySelection', () => {
  test('追加済みでない画像をすべて選んだ状態にする', () => {
    const selection = initialGallerySelection(
      [{ fileId: 'a', fileName: 'a' }, { fileId: 'b', fileName: 'b' }, { fileId: 'c', fileName: 'c' }],
      ['b'],
    )

    expect([...selection]).toEqual(['a', 'c'])
  })
})

describe('projectGalleryHref', () => {
  test('プロジェクトのギャラリータブを開く URL を返す', () => {
    expect(projectGalleryHref('p1')).toBe('/projects?open=project-p1&tab=gallery')
  })
})

describe('MessageGalleryDialog', () => {
  const images = [{ fileId: 'a', fileName: 'a.jpg' }, { fileId: 'b', fileName: 'b.jpg' }, { fileId: 'c', fileName: 'c.jpg' }]

  test('追加済みの画像は選べず、選んだ画像だけを送る', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<MessageGalleryDialog images={images} addedFileIds={['b']} onSubmit={onSubmit} onClose={onClose} />)

    expect(screen.getByRole('checkbox', { name: 'Select b.jpg' })).toBeDisabled()
    expect(screen.getByText('Added')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select c.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 photos' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith(['a']))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  test('追加に失敗したらダイアログを閉じない', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const onClose = vi.fn()
    render(<MessageGalleryDialog images={images} addedFileIds={[]} onSubmit={onSubmit} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add 3 photos' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith(['a', 'b', 'c']))
    expect(onClose).not.toHaveBeenCalled()
  })
})
