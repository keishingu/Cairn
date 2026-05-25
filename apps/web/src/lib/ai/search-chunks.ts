// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { embed } from 'ai'
import { openai, EMBEDDING_MODEL } from './client'

export interface ChunkMatch {
  sourceType: string
  sourceId: string
  content: string
  similarity: number
}

export async function searchChunks(
  query: string,
  workspaceId: string,
  opts: { limit?: number; minSimilarity?: number } = {},
): Promise<ChunkMatch[]> {
  const { limit = 5, minSimilarity = 0.5 } = opts

  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: query,
  })

  const { db } = await import('@cairn/db')
  const { sql } = await import('drizzle-orm')

  const vectorStr = `[${embedding.join(',')}]`

  const rows = await db.execute<{
    source_type: string
    source_id: string
    content: string
    similarity: number
  }>(sql`
    SELECT source_type, source_id, content,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM document_chunks
    WHERE workspace_id = ${workspaceId}::uuid
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `)

  return rows.map(r => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    content: r.content,
    similarity: Number(r.similarity),
  }))
}
