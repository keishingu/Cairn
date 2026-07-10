import { describe, expect, it } from 'vitest'
import {
  createMilestoneSchema,
  createProjectSchema,
  createTaskSchema,
  patchMilestoneSchema,
  postMessageSchema,
  uploadGalleryItemSchema,
} from './index'

describe('createProjectSchema', () => {
  it('有効なデータを受け入れる', () => {
    const result = createProjectSchema.safeParse({
      workspaceId: '00000000-0000-0000-0000-000000000001',
      title: '北アルプス縦走計画',
    })
    expect(result.success).toBe(true)
  })

  it('タイトルが空の場合エラーになる', () => {
    const result = createProjectSchema.safeParse({
      workspaceId: '00000000-0000-0000-0000-000000000001',
      title: '',
    })
    expect(result.success).toBe(false)
  })

  it('workspaceId が UUID でない場合エラーになる', () => {
    const result = createProjectSchema.safeParse({
      workspaceId: 'not-a-uuid',
      title: 'テスト',
    })
    expect(result.success).toBe(false)
  })

  it('memberUserIds に UUID 配列を指定できる', () => {
    const result = createProjectSchema.safeParse({
      workspaceId: '00000000-0000-0000-0000-000000000001',
      title: 'テスト',
      memberUserIds: [
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000011',
      ],
    })
    expect(result.success).toBe(true)
  })

  it('memberUserIds が 50 件を超えても受け入れる', () => {
    const memberUserIds = Array.from({ length: 51 }, (_, index) =>
      `00000000-0000-0000-0000-${String(index + 10).padStart(12, '0')}`,
    )
    const result = createProjectSchema.safeParse({
      workspaceId: '00000000-0000-0000-0000-000000000001',
      title: 'テスト',
      memberUserIds,
    })
    expect(result.success).toBe(true)
  })
})

describe('createTaskSchema', () => {
  it('デフォルト優先度は medium になる', () => {
    const result = createTaskSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000001',
      title: 'テント場を予約する',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priority).toBe('medium')
    }
  })

  it('高優先度を設定できる', () => {
    const result = createTaskSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000001',
      title: '計画書を最新版に更新する',
      priority: 'high',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priority).toBe('high')
    }
  })

  it('無効な優先度はエラーになる', () => {
    const result = createTaskSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000001',
      title: 'テスト',
      priority: 'critical',
    })
    expect(result.success).toBe(false)
  })
})

describe('createMilestoneSchema', () => {
  it('有効なデータを受け入れる', () => {
    const result = createMilestoneSchema.safeParse({
      title: '高所順応',
      description: '標高に慣れる期間',
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      startTime: '09:30',
      endTime: '17:00',
    })
    expect(result.success).toBe(true)
  })

  it('タイトルを trim して空ならエラーになる', () => {
    const result = createMilestoneSchema.safeParse({
      title: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('日付形式でない場合はエラーになる', () => {
    const result = createMilestoneSchema.safeParse({
      title: '高所順応',
      startDate: '2026/08/01',
    })
    expect(result.success).toBe(false)
  })

  it('時刻形式でない場合はエラーになる', () => {
    const result = createMilestoneSchema.safeParse({
      title: '高所順応',
      startTime: '25:00',
    })
    expect(result.success).toBe(false)
  })
})

describe('patchMilestoneSchema', () => {
  it('completed だけの更新を受け入れる', () => {
    const result = patchMilestoneSchema.safeParse({ completed: true })
    expect(result.success).toBe(true)
  })

  it('nullable な日付と説明を受け入れる', () => {
    const result = patchMilestoneSchema.safeParse({
      description: null,
      startDate: null,
      endDate: null,
      startTime: null,
      endTime: null,
    })
    expect(result.success).toBe(true)
  })

  it('更新対象が空ならエラーになる', () => {
    const result = patchMilestoneSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('postMessageSchema', () => {
  it('デフォルトの messageType は text になる', () => {
    const result = postMessageSchema.safeParse({
      channelId: '00000000-0000-0000-0000-000000000001',
      content: 'こんにちは',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messageType).toBe('text')
    }
  })

  it('空のメッセージはエラーになる', () => {
    const result = postMessageSchema.safeParse({
      channelId: '00000000-0000-0000-0000-000000000001',
      content: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('uploadGalleryItemSchema', () => {
  it('有効な座標を受け入れる', () => {
    const result = uploadGalleryItemSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000001',
      fileId: '00000000-0000-0000-0000-000000000002',
      latitude: 36.2848,
      longitude: 137.6490,
    })
    expect(result.success).toBe(true)
  })

  it('範囲外の緯度はエラーになる', () => {
    const result = uploadGalleryItemSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000001',
      fileId: '00000000-0000-0000-0000-000000000002',
      latitude: 999,
    })
    expect(result.success).toBe(false)
  })
})
