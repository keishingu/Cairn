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
})

export const updateProjectStatusSchema = z.object({
  projectId: z.string().uuid(),
  statusId: z.string().uuid(),
})

export const postMessageSchema = z.object({
  channelId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  messageType: z.enum(['text', 'html', 'system']).default('text'),
  parentMessageId: z.string().uuid().optional(),
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

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>
export type PostMessageInput = z.infer<typeof postMessageSchema>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UploadGalleryItemInput = z.infer<typeof uploadGalleryItemSchema>
