// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'

export const fileTypeFilterSchema = z.enum(['all', 'pdf', 'img', 'doc'])

const scopeIdSchema = z.string().trim().min(1).max(100)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const fileFilterConditionsSchema = z
  .object({
    search: z.string().trim().max(200).default(''),
    type: fileTypeFilterSchema.default('all'),
    projectId: scopeIdSchema.default('all'),
    uploaderId: scopeIdSchema.default('all'),
    createdFrom: dateSchema.nullable().default(null),
    createdTo: dateSchema.nullable().default(null),
  })
  .refine(
    (conditions) =>
      !conditions.createdFrom ||
      !conditions.createdTo ||
      conditions.createdFrom <= conditions.createdTo,
    { message: '開始日は終了日以前にしてください', path: ['createdTo'] },
  )

export const savedFileFilterInputSchema = z.object({
  name: z.string().trim().min(1, 'フィルター名を入力してください').max(50),
  conditions: fileFilterConditionsSchema,
})

export type FileTypeFilter = z.infer<typeof fileTypeFilterSchema>
export type FileFilterConditions = z.infer<typeof fileFilterConditionsSchema>

export interface SavedFileFilterDto {
  id: string
  name: string
  conditions: FileFilterConditions
  createdAt: string
  updatedAt: string
}

export const DEFAULT_FILE_FILTER_CONDITIONS: FileFilterConditions = {
  search: '',
  type: 'all',
  projectId: 'all',
  uploaderId: 'all',
  createdFrom: null,
  createdTo: null,
}

export function parseSavedFileFilterConditions(value: unknown): FileFilterConditions | null {
  const parsed = fileFilterConditionsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
