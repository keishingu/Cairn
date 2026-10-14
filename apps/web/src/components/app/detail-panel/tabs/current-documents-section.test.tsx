// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutation: { mutateAsync: vi.fn() },
  result: {} as Record<string, unknown>,
}))
vi.mock('@/hooks/use-project-files', () => ({ useProjectFiles: () => mocks.result }))

import { CurrentDocumentsSection } from './current-documents-section'

const currentFile = {
  id: '30000000-0000-0000-0000-000000000001',
  fileName: 'approved-plan.pdf',
  fileType: 'document',
  isLatest: true,
  latestChangeNote: 'Updated the route map',
}
const candidateFile = {
  id: '30000000-0000-0000-0000-000000000002',
  fileName: 'revised-plan.pdf',
  fileType: 'document',
  isLatest: false,
}

describe('プロジェクトの確定資料', () => {
  beforeEach(() => {
    mocks.mutation.mutateAsync.mockReset().mockResolvedValue(undefined)
    mocks.result = {
      data: [currentFile, candidateFile],
      isLoading: false,
      isError: false,
      replaceLatestMutation: mocks.mutation,
    }
  })

  it('最新版のファイルと変更メモを表示し、既存の閲覧URLを使う', () => {
    render(<CurrentDocumentsSection projectId="20000000-0000-0000-0000-000000000001" canEdit={false} />)
    expect(screen.getByRole('heading', { name: '確定資料' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'approved-plan.pdf' })).toHaveAttribute(
      'href',
      `/api/attachments/${currentFile.id}`,
    )
    expect(screen.getByText('変更メモ: Updated the route map')).toBeInTheDocument()
  })

  it('guest相当の読み取り専用表示では差し替え操作を出さない', () => {
    render(<CurrentDocumentsSection projectId="project-1" canEdit={false} />)
    expect(screen.queryByRole('button', { name: '差し替え' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '確定資料を追加' })).not.toBeInTheDocument()
  })

  it('差し替えにはメモを求め、既存ファイルへの置換を送る', async () => {
    render(<CurrentDocumentsSection projectId="project-1" canEdit />)
    fireEvent.click(screen.getByRole('button', { name: '差し替え' }))
    const save = screen.getByRole('button', { name: '保存' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('変更メモ'), { target: { value: '新しい承認版です' } })
    expect(save).toBeEnabled()
    await act(async () => {
      fireEvent.click(save)
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(mocks.mutation.mutateAsync).toHaveBeenCalledWith({
      fileId: candidateFile.id,
      replaceFileId: currentFile.id,
      note: '新しい承認版です',
    }))
  })

  it('ファイル一覧の取得エラーを表示し、資料を追加できない', () => {
    mocks.result = { ...mocks.result, isError: true }
    render(<CurrentDocumentsSection projectId="project-1" canEdit />)
    expect(screen.getByText('ファイルの取得に失敗しました')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '確定資料を追加' })).not.toBeInTheDocument()
  })
})
