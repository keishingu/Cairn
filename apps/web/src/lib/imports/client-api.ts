// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { uploadAttachment } from '@/lib/attachments/upload-client'
import type { ImportApi } from './client-runner'

/** 取り込み API の呼び出し（画面から使う）。失敗したらサーバーの理由か、渡された文言で例外にする */

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof data.error === 'string' ? data.error : fallback
}

export async function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await readError(res, fallback))
  return (await res.json()) as T
}

/** 取り込み先の新しいチャンネルを非公開で作る（作った管理者だけが見られる） */
export async function createImportChannel(name: string, fallback: string): Promise<{ id: string }> {
  return postJson<{ id: string }>('/api/workspaces/channels', { name, isPrivate: true }, fallback)
}

export function createImportApi(t: (key: string) => string): ImportApi {
  return {
    createJob: body => postJson('/api/imports/jobs', body, t('Could not start the import')),
    lookupMedia: async (jobId, channelId, objectIds) => (await postJson<{ found: Record<string, string> }>(`/api/imports/jobs/${jobId}/media/lookup`, { channelId, objectIds }, t('Could not check uploaded images'))).found,
    uploadMedia: async (channelId, file) => ({ fileId: (await uploadAttachment(channelId, file)).fileId }),
    registerMedia: (jobId, body) => postJson(`/api/imports/jobs/${jobId}/media`, body, t('Could not register the image')),
    importBatch: (jobId, body) => postJson(`/api/imports/jobs/${jobId}/batches`, body, t('Could not import messages')),
    completeJob: (jobId, body) => postJson(`/api/imports/jobs/${jobId}/complete`, body, t('Could not finish the import')),
  }
}
