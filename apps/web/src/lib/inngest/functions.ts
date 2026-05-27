// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { inngest } from './client'
import { createServiceRoleClient } from '@/lib/supabase/service'

const BATCH_SIZE = 100

export const deleteStorageObjects = inngest.createFunction(
  { id: 'delete-storage-objects' },
  { event: 'storage/objects.delete' },
  async ({ event, step }) => {
    const { bucket, paths } = event.data as { bucket: string; paths: string[] }

    if (paths.length === 0) return { deleted: 0 }

    let deleted = 0
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE)
      await step.run(`delete-batch-${i}`, async () => {
        const supabase = createServiceRoleClient()
        const { data, error } = await supabase.storage.from(bucket).remove(batch)
        if (error) throw error
        deleted += data?.length ?? 0
      })
    }

    return { deleted }
  },
)

const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export const indexFileChunks = inngest.createFunction(
  { id: 'index-file-chunks' },
  { event: 'file/uploaded' },
  async ({ event, step }) => {
    const { fileId, workspaceId, mimeType, storagePath } = event.data as {
      fileId: string
      workspaceId: string
      mimeType: string
      storagePath: string
    }

    if (!INDEXABLE_MIME_TYPES.has(mimeType)) {
      return { skipped: true, reason: 'not an indexable document type' }
    }

    const text = await step.run('extract-text', async () => {
      const supabase = createServiceRoleClient()
      const { data, error } = await supabase.storage.from('chat-attachments').download(storagePath)
      if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)

      const { extractText } = await import('@/lib/ai/extract-text')
      const buffer = Buffer.from(await data.arrayBuffer())
      return extractText(buffer, mimeType)
    })

    const chunks = await step.run('chunk-text', async () => {
      const { chunkText } = await import('@/lib/ai/chunk-text')
      return chunkText(text)
    })

    if (chunks.length === 0) return { indexed: 0 }

    await step.run('save-embeddings', async () => {
      const { embedMany } = await import('ai')
      const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')
      const { db, documentChunks } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')

      const { embeddings } = await embedMany({
        model: openai.embedding(EMBEDDING_MODEL),
        values: chunks,
      })

      await db
        .delete(documentChunks)
        .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

      await db.insert(documentChunks).values(
        chunks.map((content, i) => ({
          workspaceId,
          sourceType: 'file' as const,
          sourceId: fileId,
          chunkIndex: i,
          content,
          embedding: embeddings[i]!,
        })),
      )
    })

    return { indexed: chunks.length }
  },
)

export const indexProjectChunks = inngest.createFunction(
  { id: 'index-project-chunks' },
  { event: 'project/upserted' },
  async ({ event, step }) => {
    const { projectId, workspaceId } = event.data as { projectId: string; workspaceId: string }

    await step.run('embed-and-save', async () => {
      const { db, projects, projectStatuses, projectMembers, profiles, documentChunks } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')

      const [row] = await db
        .select({
          title: projects.title,
          description: projects.description,
          startDate: projects.startDate,
          endDate: projects.endDate,
          statusName: projectStatuses.name,
        })
        .from(projects)
        .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
        .limit(1)

      if (!row) return

      const memberRows = await db
        .select({ displayName: profiles.displayName })
        .from(projectMembers)
        .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
        .where(eq(projectMembers.projectId, projectId))

      const lines: string[] = [
        `プロジェクト: ${row.title}`,
        ...(row.description ? [`説明: ${row.description}`] : []),
        ...(row.statusName ? [`ステータス: ${row.statusName}`] : []),
        ...(row.startDate ? [`開始日: ${row.startDate}`] : []),
        ...(row.endDate ? [`終了日: ${row.endDate}`] : []),
        ...(memberRows.length > 0 ? [`メンバー: ${memberRows.map(m => m.displayName).join('、')}`] : []),
      ]

      const content = lines.join('\n')

      const { embed } = await import('ai')
      const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')

      const { embedding } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: content,
      })

      await db
        .delete(documentChunks)
        .where(and(eq(documentChunks.sourceType, 'project'), eq(documentChunks.sourceId, projectId)))

      await db.insert(documentChunks).values({
        workspaceId,
        sourceType: 'project',
        sourceId: projectId,
        chunkIndex: 0,
        content,
        embedding,
      })
    })

    return { indexed: 1 }
  },
)

export const indexExternalLink = inngest.createFunction(
  { id: 'index-external-link' },
  { event: 'link/registered' },
  async ({ event, step }) => {
    const { fileId, workspaceId, docId } = event.data as {
      fileId: string
      workspaceId: string
      docId: string
    }

    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`

    const fetchResult = await step.run('fetch-text', async () => {
      const res = await fetch(exportUrl, { redirect: 'follow' })
      const contentType = res.headers.get('content-type') ?? ''

      // 非公開ドキュメントはログインページ（text/html）が返る
      if (!res.ok || !contentType.startsWith('text/plain')) {
        return { ok: false as const }
      }

      const rawText = await res.text()

      // 1st try: Content-Disposition ヘッダーからタイトルを取得
      const cd = res.headers.get('content-disposition') ?? ''
      const cdMatch = /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i.exec(cd)
      let title = cdMatch
        ? decodeURIComponent(cdMatch[1]!.trim()).replace(/\.txt$/i, '')
        : null

      // 2nd try: HTML export の <title> タグからタイトルを取得
      if (!title) {
        try {
          const htmlRes = await fetch(
            `https://docs.google.com/document/d/${docId}/export?format=html`,
            { redirect: 'follow' },
          )
          if (htmlRes.ok) {
            const html = await htmlRes.text()
            const htmlMatch = /<title>([^<]+)<\/title>/i.exec(html)
            if (htmlMatch) {
              title = htmlMatch[1]!.trim()
            }
          }
        } catch {
          // タイトル取得失敗は無視（デフォルト名のまま）
        }
      }

      return { ok: true as const, text: rawText, title }
    })

    if (!fetchResult.ok) {
      await step.run('mark-private', async () => {
        const { db, files } = await import('@cairn/db')
        const { eq } = await import('drizzle-orm')
        const [row] = await db.select({ metadata: files.metadata }).from(files).where(eq(files.id, fileId)).limit(1)
        if (!row) return
        const meta = Object.assign({}, row.metadata as Record<string, unknown>)
        await db.update(files).set({ metadata: { ...meta, indexingStatus: 'failed' } }).where(eq(files.id, fileId))
      })
      return { indexed: 0, reason: 'private' }
    }

    const chunks = await step.run('chunk-text', async () => {
      const { chunkText } = await import('@/lib/ai/chunk-text')
      return chunkText(fetchResult.text)
    })

    await step.run('save-embeddings', async () => {
      const { db, documentChunks, files } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')
      const [row] = await db.select({ metadata: files.metadata }).from(files).where(eq(files.id, fileId)).limit(1)
      if (!row) return

      const meta = Object.assign({}, row.metadata as Record<string, unknown>)
      const newMeta = { ...meta, indexingStatus: 'indexed' }

      if (chunks.length > 0) {
        const { embedMany } = await import('ai')
        const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')

        const { embeddings } = await embedMany({
          model: openai.embedding(EMBEDDING_MODEL),
          values: chunks,
        })

        await db
          .delete(documentChunks)
          .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

        await db.insert(documentChunks).values(
          chunks.map((content, i) => ({
            workspaceId,
            sourceType: 'file' as const,
            sourceId: fileId,
            chunkIndex: i,
            content,
            embedding: embeddings[i]!,
          })),
        )
      }

      if (fetchResult.title) {
        await db.update(files).set({ fileName: fetchResult.title, metadata: newMeta }).where(eq(files.id, fileId))
      } else {
        await db.update(files).set({ metadata: newMeta }).where(eq(files.id, fileId))
      }
    })

    return { indexed: chunks.length }
  },
)

export const indexMemberChunks = inngest.createFunction(
  { id: 'index-member-chunks' },
  { event: 'member/upserted' },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string }

    await step.run('embed-and-save', async () => {
      const { db, profiles, memberExperiences, documentChunks } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')

      const [profile] = await db
        .select({ displayName: profiles.displayName, bio: profiles.bio })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)

      if (!profile) return

      const experiences = await db
        .select({
          category: memberExperiences.category,
          title: memberExperiences.title,
          level: memberExperiences.level,
          notes: memberExperiences.notes,
        })
        .from(memberExperiences)
        .where(eq(memberExperiences.userId, userId))

      const lines: string[] = [
        `メンバー: ${profile.displayName}`,
        ...(profile.bio ? [`自己紹介: ${profile.bio}`] : []),
        ...(experiences.length > 0
          ? [
              '\nスキル・経験:',
              ...experiences.map(
                e =>
                  `- ${e.category} (${e.title})${e.level ? `: ${e.level}` : ''}${e.notes ? `\n  ${e.notes}` : ''}`,
              ),
            ]
          : []),
      ]

      const content = lines.join('\n')

      const { embed } = await import('ai')
      const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')

      const { embedding } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: content,
      })

      await db
        .delete(documentChunks)
        .where(and(eq(documentChunks.sourceType, 'member'), eq(documentChunks.sourceId, userId), eq(documentChunks.workspaceId, workspaceId)))

      await db.insert(documentChunks).values({
        workspaceId,
        sourceType: 'member',
        sourceId: userId,
        chunkIndex: 0,
        content,
        embedding,
      })
    })

    return { indexed: 1 }
  },
)
