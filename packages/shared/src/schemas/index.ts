// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'

export const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  statusId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  coverPhotoUrl: z.string().url().optional(),
  location: z.string().max(500).optional(),
  placeId: z.string().max(500).optional(),
  placePhotoName: z.string().max(500).optional(),
  memberUserIds: z.array(z.string().uuid()).optional(),
})

export const updateProjectStatusSchema = z.object({
  projectId: z.string().uuid(),
  statusId: z.string().uuid(),
})

export const postMessageSchema = z
  .object({
    channelId: z.string().uuid(),
    content: z.string().max(10000).default(''),
    messageType: z.enum(['text', 'html']).default('text'),
    parentMessageId: z.string().uuid().optional(),
    attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .refine(
    (d) => d.content.length > 0 || (d.attachmentFileIds?.length ?? 0) > 0,
    { message: 'テキストまたは添付ファイルが必要です' },
  )

export const editMessageSchema = z.object({
  content: z.string().min(1).max(10000),
})

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().date().optional(),
})

export const uploadGalleryItemSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid(),
  caption: z.string().max(500).optional(),
  takenAt: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export type EditMessageInput = z.infer<typeof editMessageSchema>
export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>
export type PostMessageInput = z.infer<typeof postMessageSchema>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UploadGalleryItemInput = z.infer<typeof uploadGalleryItemSchema>

export interface AttachmentDto {
  id: string
  fileId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  displayOrder: number
}
