// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// ファイル一覧 API（GET /api/files・/api/files/facets）のクエリパラメータとカーソル。
// クライアントとサーバーの両方から読むため、DB には依存させない。

import { z } from 'zod'
import { fileTypeFilterSchema, type FileFilterConditions } from './saved-file-filter'

export const DOC_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
]

export const FILE_LIST_DEFAULT_LIMIT = 50
export const FILE_LIST_MAX_LIMIT = 100
export const FILE_LIST_MAX_SEARCH_TERMS = 5

export interface FileListCursor {
  /** files.created_at をマイクロ秒まで含む ISO 文字列（JS の Date に通すとミリ秒へ丸まり、境界の行を取りこぼす） */
  createdAt: string
  id: string
}

const cursorSchema = z.object({
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/),
  id: z.string().uuid(),
})

export function encodeFileListCursor(cursor: FileListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeFileListCursor(value: string): FileListCursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const isoTimestampSchema = z.string().datetime({ offset: true })
const scopeSchema = z.string().trim().min(1).max(100)

export interface FileListFilters {
  type: z.infer<typeof fileTypeFilterSchema>
  /** 'all' / 'none'（プロジェクトなし）/ プロジェクト ID */
  projectId: string
  /** 'all' / アップロード者 ID */
  uploaderId: string
  /** この時刻以降（含む） */
  createdFrom: string | null
  /** この時刻より前（含まない） */
  createdBefore: string | null
  /** ファイル名・プロジェクト名・チャンネル名の部分一致。複数あれば AND */
  search: string[]
}

export type ParsedFileListParams =
  | { ok: true; filters: FileListFilters; cursor: FileListCursor | null; limit: number }
  | { ok: false; error: string }

export function parseFileListParams(params: URLSearchParams): ParsedFileListParams {
  const type = fileTypeFilterSchema.safeParse(params.get('type') ?? 'all')
  if (!type.success) return { ok: false, error: 'Invalid type' }

  const projectId = scopeSchema.safeParse(params.get('projectId') ?? 'all')
  if (!projectId.success) return { ok: false, error: 'Invalid projectId' }
  if (projectId.data !== 'all' && projectId.data !== 'none' && !z.string().uuid().safeParse(projectId.data).success) {
    return { ok: false, error: 'Invalid projectId' }
  }

  const uploaderId = scopeSchema.safeParse(params.get('uploaderId') ?? 'all')
  if (!uploaderId.success) return { ok: false, error: 'Invalid uploaderId' }
  if (uploaderId.data !== 'all' && !z.string().uuid().safeParse(uploaderId.data).success) {
    return { ok: false, error: 'Invalid uploaderId' }
  }

  const fromRaw = params.get('createdFrom')
  const createdFrom = fromRaw === null ? null : isoTimestampSchema.safeParse(fromRaw)
  if (createdFrom && !createdFrom.success) return { ok: false, error: 'Invalid createdFrom' }

  const beforeRaw = params.get('createdBefore')
  const createdBefore = beforeRaw === null ? null : isoTimestampSchema.safeParse(beforeRaw)
  if (createdBefore && !createdBefore.success) return { ok: false, error: 'Invalid createdBefore' }

  const search = params.getAll('q').map(q => q.trim()).filter(Boolean)
  // 検索語ごとに部分一致の条件とサブクエリが増えるため、個数も絞る（画面が送るのは最大2個）
  if (search.length > FILE_LIST_MAX_SEARCH_TERMS || search.some(q => q.length > 200)) {
    return { ok: false, error: 'Invalid q' }
  }

  const cursorRaw = params.get('cursor')
  const cursor = cursorRaw === null ? null : decodeFileListCursor(cursorRaw)
  if (cursorRaw !== null && !cursor) return { ok: false, error: 'Invalid cursor' }

  const limitRaw = params.get('limit')
  const limit = z.coerce.number().int().min(1).max(FILE_LIST_MAX_LIMIT)
    .safeParse(limitRaw ?? FILE_LIST_DEFAULT_LIMIT)
  if (!limit.success) return { ok: false, error: 'Invalid limit' }

  return {
    ok: true,
    filters: {
      type: type.data,
      projectId: projectId.data,
      uploaderId: uploaderId.data,
      createdFrom: createdFrom?.data ?? null,
      createdBefore: createdBefore?.data ?? null,
      search,
    },
    cursor,
    limit: limit.data,
  }
}

function startOfLocalDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/**
 * 画面の絞り込み条件をクエリパラメータにする。日付は閲覧者のローカル日付なので、
 * サーバーのタイムゾーンに左右されないよう、その日の 0 時（ローカル）を UTC の時刻にして渡す。
 */
export function buildFileListSearchParams(
  conditions: FileFilterConditions,
  extraSearch: string[] = [],
): URLSearchParams {
  const params = new URLSearchParams()
  if (conditions.type !== 'all') params.set('type', conditions.type)
  if (conditions.projectId !== 'all') params.set('projectId', conditions.projectId)
  if (conditions.uploaderId !== 'all') params.set('uploaderId', conditions.uploaderId)
  if (conditions.createdFrom) {
    params.set('createdFrom', startOfLocalDay(conditions.createdFrom).toISOString())
  }
  if (conditions.createdTo) {
    const nextDay = startOfLocalDay(conditions.createdTo)
    nextDay.setDate(nextDay.getDate() + 1)
    params.set('createdBefore', nextDay.toISOString())
  }
  for (const q of [conditions.search, ...extraSearch]) {
    const trimmed = q.trim()
    if (trimmed) params.append('q', trimmed)
  }
  return params
}

/** LIKE / ILIKE のワイルドカードを文字どおりに扱うためのエスケープ */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
