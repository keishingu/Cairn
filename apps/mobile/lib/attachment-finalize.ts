// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { apiFetch } from './api-fetch'

export interface AttachmentFinalizeRequest {
  channelId: string
  storagePath: string
  fileName: string
  mimeType: string
  fileSize: number
}

export interface FinalizedAttachment {
  fileId: string
}

export class AttachmentFinalizeError extends Error {
  constructor(
    message: string,
    readonly retryFinalize: () => Promise<FinalizedAttachment>,
  ) {
    super(message)
    this.name = 'AttachmentFinalizeError'
  }
}

async function responseError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return data.error ?? fallback
}

export async function finalizeAttachment(
  body: AttachmentFinalizeRequest,
  fallback: string,
): Promise<FinalizedAttachment> {
  const retryFinalize = () => finalizeAttachment(body, fallback)
  let response: Response
  try {
    response = await apiFetch('/api/attachments/finalize', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new AttachmentFinalizeError(
      error instanceof Error ? error.message : fallback,
      retryFinalize,
    )
  }
  if (!response.ok) {
    throw new AttachmentFinalizeError(await responseError(response, fallback), retryFinalize)
  }
  return (await response.json()) as FinalizedAttachment
}
