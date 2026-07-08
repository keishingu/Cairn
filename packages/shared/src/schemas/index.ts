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

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  dueDate: z.string().date().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
}).refine(
  data => Object.values(data).some(value => value !== undefined),
  { message: 'At least one field is required' },
)

export const patchProjectSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  statusName: z.string().max(100).optional(),
  archived: z.boolean().optional(),
  coverPhotoUrl: z.string().url().nullable().optional(),
  placePhotoName: z.string().max(500).optional(),
  location: z.string().max(500).nullable().optional(),
  placeId: z.string().max(500).nullable().optional(),
}).refine(
  data => Object.values(data).some(value => value !== undefined),
  { message: 'At least one field is required' },
)

export const patchWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
}).refine(
  data => Object.values(data).some(value => value !== undefined),
  { message: 'At least one field is required' },
)

export const patchMeSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  bio: z.string().max(1000).nullable().optional(),
  status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
  statusMessage: z.string().max(100).nullable().optional(),
}).refine(
  data => Object.values(data).some(value => value !== undefined),
  { message: 'At least one field is required' },
)

export const createProjectStatusSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})
export type CreateProjectStatusInput = z.infer<typeof createProjectStatusSchema>

export const patchProjectStatusSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.string().max(100).optional(),
}).refine(
  data => Object.values(data).some(value => value !== undefined),
  { message: 'At least one field is required' },
)

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
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type UploadGalleryItemInput = z.infer<typeof uploadGalleryItemSchema>
export type PatchProjectInput = z.infer<typeof patchProjectSchema>
export type PatchWorkspaceInput = z.infer<typeof patchWorkspaceSchema>
export type PatchMeInput = z.infer<typeof patchMeSchema>
export type PatchProjectStatusInput = z.infer<typeof patchProjectStatusSchema>

export interface AttachmentDto {
  id: string
  fileId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  displayOrder: number
}
