// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import {
  buildStorageDeletionTargets,
  deleteAccount,
  LastOwnerAccountDeletionError,
  type AccountDeletionDependencies,
} from './account-deletion'

const USER_ID = '00000000-0000-0000-0000-000000000001'

function createDependencies(): AccountDeletionDependencies & {
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    findBlockingOwnerWorkspaces: vi.fn(async () => {
      calls.push('owners')
      return []
    }),
    readContext: vi.fn(async () => {
      calls.push('context')
      return {
        billingCustomerId: 'cus_1',
        avatarPaths: [],
      }
    }),
    deleteBillingCustomer: vi.fn(async () => {
      calls.push('billing')
    }),
    anonymizeAndRevoke: vi.fn(async (_userId, _now, context, deleteBillingCustomer) => {
      calls.push('anonymize')
      await deleteBillingCustomer(context.billingCustomerId)
      return 'storage-job-1'
    }),
    enqueueStorageDeletion: vi.fn(async () => {
      calls.push('storage-enqueue')
    }),
    deleteAuthUser: vi.fn(async () => {
      calls.push('auth-user')
    }),
  }
}

describe('アカウント削除', () => {
  it('匿名化、Storage削除予約、課金停止、Auth削除の順で完了する', async () => {
    const dependencies = createDependencies()

    await deleteAccount(USER_ID, dependencies)

    expect(dependencies.calls).toEqual([
      'owners',
      'context',
      'anonymize',
      'billing',
      'storage-enqueue',
      'auth-user',
    ])
    expect(dependencies.enqueueStorageDeletion).toHaveBeenCalledWith('storage-job-1')
    expect(dependencies.deleteAuthUser).toHaveBeenCalledWith(USER_ID)
  })

  it('最後のownerなら外部状態を変更せず中断する', async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.findBlockingOwnerWorkspaces).mockResolvedValue([
      { id: 'workspace-1', name: '山岳部' },
    ])

    await expect(deleteAccount(USER_ID, dependencies)).rejects.toBeInstanceOf(
      LastOwnerAccountDeletionError,
    )

    expect(dependencies.calls).toEqual([])
    expect(dependencies.readContext).not.toHaveBeenCalled()
  })

  it('匿名化に失敗したらStorageやAuthユーザーを削除しない', async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.anonymizeAndRevoke).mockRejectedValue(new Error('database unavailable'))

    await expect(deleteAccount(USER_ID, dependencies)).rejects.toThrow('database unavailable')

    expect(dependencies.enqueueStorageDeletion).not.toHaveBeenCalled()
    expect(dependencies.deleteBillingCustomer).not.toHaveBeenCalled()
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('アバター・投稿ファイル・未確定アップロードをバケット別に重複なくまとめる', () => {
    expect(
      buildStorageDeletionTargets(
        ['workspace-1/user-1.png'],
        [
          {
            storagePath: 'workspace-1/chat/file.pdf',
            derivedStoragePath: null,
            thumbnailPath: 'workspace-1/chat/thumb/file.jpg',
            isGallery: false,
          },
          {
            storagePath: 'workspace-1/gallery/original.jpg',
            derivedStoragePath: 'workspace-1/gallery/derived.jpg',
            thumbnailPath: null,
            isGallery: true,
          },
        ],
        [
          {
            originalStoragePath: 'workspace-1/gallery/pending-original.jpg',
            derivedStoragePath: 'workspace-1/gallery/pending-derived.jpg',
          },
        ],
      ),
    ).toEqual([
      { bucket: 'avatars', paths: ['workspace-1/user-1.png'] },
      {
        bucket: 'chat-attachments',
        paths: ['workspace-1/chat/file.pdf', 'workspace-1/chat/thumb/file.jpg'],
      },
      {
        bucket: 'gallery-originals',
        paths: ['workspace-1/gallery/original.jpg', 'workspace-1/gallery/pending-original.jpg'],
      },
      {
        bucket: 'gallery',
        paths: ['workspace-1/gallery/derived.jpg', 'workspace-1/gallery/pending-derived.jpg'],
      },
    ])
  })
})
