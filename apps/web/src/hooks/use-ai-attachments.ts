// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの入力欄の添付。選んだ時点で会話にアップロードし、送信時は添付の ID だけを送る
// （本体はサーバーが Storage から読む。docs/10_ai_member_design.md「会話への添付」）。

import React from 'react'
import type { Attachment } from 'ai'
import { useT } from '@/components/locale-provider'
import { GENERIC_MIME_TYPES, resolveAttachmentMimeType } from '@/lib/attachments'
import {
  AI_ATTACHMENT_IMAGE_TYPES,
  AI_ATTACHMENT_MAX_BYTES,
  AI_ATTACHMENT_MAX_FILES,
  isAiAttachmentType,
} from '@/lib/ai/attachment-types'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

/**
 * 送信前の添付の状態。送信してよいかはこの状態だけで決める（sendBlocker）。
 * - uploading: 行の作成と Storage へのアップロードの途中
 * - ready: 送れる
 * - removing: サーバーから消している途中
 * - upload-failed: アップロードに失敗した（外すまで送らせない）
 * - remove-failed: 外そうとしたが消せなかった（もう一度外すまで送らせない）
 */
export type PendingAttachmentState =
  | { kind: 'uploading' }
  | { kind: 'ready'; attachmentId: string }
  | { kind: 'removing'; attachmentId: string }
  | { kind: 'upload-failed'; attachmentId: string | null; error: string }
  | { kind: 'remove-failed'; attachmentId: string; error: string }

export interface PendingAiAttachment {
  localId: string
  fileName: string
  mimeType: string
  /** 画像のプレビュー（送信後のメッセージの表示にも、保存した添付で置き換えるまで使う） */
  previewUrl?: string
  state: PendingAttachmentState
}

export type SendBlocker = 'uploading' | 'removing' | 'failed'

/** 送信を止める理由。null なら送れる（どの添付も ready）。黙って一部の添付を外して送らない */
export function sendBlocker(items: ReadonlyArray<PendingAiAttachment>): SendBlocker | null {
  if (items.some(item => item.state.kind === 'uploading')) return 'uploading'
  if (items.some(item => item.state.kind === 'removing')) return 'removing'
  if (items.some(item => item.state.kind === 'upload-failed' || item.state.kind === 'remove-failed')) return 'failed'
  return null
}

async function serverError(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof body.error === 'string' ? body.error : undefined
}

/** ファイルの形式を決める。拡張子・MIME で分からなければ先頭のバイト列で判定する */
async function resolveMimeType(file: File): Promise<string | null> {
  let mimeType = resolveAttachmentMimeType(file.name, file.type)
  if (!mimeType && GENERIC_MIME_TYPES.has(file.type)) {
    mimeType = resolveAttachmentMimeType(file.name, file.type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  }
  return mimeType && isAiAttachmentType(mimeType) ? mimeType : null
}

export function useAiAttachments(conversationId: string) {
  const t = useT()
  const [pending, setPending] = React.useState<PendingAiAttachment[]>([])
  const [notice, setNotice] = React.useState<string | null>(null)
  // 送信に失敗したときに入力欄へ戻す添付
  const lastSentRef = React.useRef<PendingAiAttachment[]>([])
  // アップロードの途中で外した添付。行ができた時点でサーバーから消す
  // （消さないと送信前の添付の上限に数えられ、1日の定期回収までその会話で添付できなくなる）
  const canceledRef = React.useRef(new Set<string>())

  // 画像のプレビュー用の blob URL。使い終わったら解放する（解放しないとファイルを掴んだままメモリに残る）。
  // 送った添付のプレビューは、保存した添付のリンクに置き換わるまで送信済みのメッセージで使う
  const pendingRef = React.useRef(pending)
  pendingRef.current = pending
  const sentPreviewUrlsRef = React.useRef<string[]>([])
  const revoke = (url: string | undefined) => {
    if (url) URL.revokeObjectURL(url)
  }
  React.useEffect(() => () => {
    for (const item of pendingRef.current) revoke(item.previewUrl)
    for (const url of sentPreviewUrlsRef.current) revoke(url)
  }, [])

  const setState = (localId: string, state: PendingAttachmentState) =>
    setPending(prev => prev.map(item => (item.localId === localId ? { ...item, state } : item)))
  const drop = (localId: string) => setPending(prev => {
    revoke(prev.find(item => item.localId === localId)?.previewUrl)
    return prev.filter(item => item.localId !== localId)
  })

  /** サーバーから添付を消す。消せたか（すでに無いときも含む）を返す */
  const deleteOnServer = async (attachmentId: string): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`/api/ai/conversations/${conversationId}/attachments/${attachmentId}`, { method: 'DELETE' })
      return res.ok || res.status === 404
    } catch {
      return false
    }
  }
  // 途中で外した添付は表示から消えているため、消せなかったことだけを知らせる（送らなければ1日で定期回収される）
  const deleteCanceled = async (attachmentId: string) => {
    if (!(await deleteOnServer(attachmentId))) setNotice(t('Could not remove an attachment on the server. It will be removed automatically within a day.'))
  }

  const upload = async (localId: string, file: File, mimeType: string) => {
    let attachmentId: string | null = null
    try {
      const res = await fetchWithAuth(`/api/ai/conversations/${conversationId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size }),
      })
      if (!res.ok) {
        const error = (await serverError(res)) ?? t('Could not upload the file')
        if (!canceledRef.current.delete(localId)) setState(localId, { kind: 'upload-failed', attachmentId: null, error })
        return
      }
      const created = (await res.json()) as { attachmentId: string; path: string; token: string; mimeType: string }
      attachmentId = created.attachmentId
      if (canceledRef.current.delete(localId)) {
        void deleteCanceled(attachmentId)
        return
      }
      // Storage はファイル自身の type を見るため、正規化した MIME を持つ File で送る（チャットの添付と同じ）
      const body = file.type === created.mimeType ? file : new File([file], file.name, { type: created.mimeType })
      const { error } = await createSupabaseClient().storage.from('ai-attachments').uploadToSignedUrl(created.path, created.token, body)
      if (canceledRef.current.delete(localId)) {
        void deleteCanceled(attachmentId)
        return
      }
      setState(localId, error
        ? { kind: 'upload-failed', attachmentId, error: t('Could not upload the file') }
        : { kind: 'ready', attachmentId })
    } catch {
      if (canceledRef.current.delete(localId)) {
        if (attachmentId) void deleteCanceled(attachmentId)
        return
      }
      setState(localId, { kind: 'upload-failed', attachmentId, error: t('Could not upload the file') })
    }
  }

  const add = async (files: FileList | File[]) => {
    setNotice(null)
    const list = [...files]
    const room = AI_ATTACHMENT_MAX_FILES - pending.length
    if (list.length > room) setNotice(t('You can attach up to {count} files at a time', { count: AI_ATTACHMENT_MAX_FILES }))
    for (const file of list.slice(0, Math.max(room, 0))) {
      if (file.size > AI_ATTACHMENT_MAX_BYTES) {
        setNotice(t('{name} is larger than 10MB', { name: file.name }))
        continue
      }
      const mimeType = await resolveMimeType(file)
      if (!mimeType) {
        setNotice(t('{name} cannot be attached. Use images, PDF, Word, Excel, PowerPoint, CSV, or text files.', { name: file.name }))
        continue
      }
      const localId = crypto.randomUUID()
      setPending(prev => [...prev, {
        localId,
        fileName: file.name,
        mimeType,
        state: { kind: 'uploading' },
        ...(AI_ATTACHMENT_IMAGE_TYPES.has(mimeType) ? { previewUrl: URL.createObjectURL(file) } : {}),
      }])
      void upload(localId, file, mimeType)
    }
  }

  const remove = async (localId: string) => {
    const item = pending.find(candidate => candidate.localId === localId)
    if (!item) return
    const { state } = item
    if (state.kind === 'removing') return
    // アップロード中なら表示から外し、行ができた時点でサーバーから消す
    if (state.kind === 'uploading') {
      canceledRef.current.add(localId)
      drop(localId)
      return
    }
    // サーバーに行が無ければ、表示から外すだけでよい
    if (state.kind === 'upload-failed' && !state.attachmentId) {
      drop(localId)
      return
    }
    // サーバーから消せてから表示から外す。消せなければ残してエラーを出し、もう一度外せるようにする
    // （残った添付は送信前の上限に数えられるため、消せたことにはしない）
    const attachmentId = state.attachmentId!
    setState(localId, { kind: 'removing', attachmentId })
    if (await deleteOnServer(attachmentId)) {
      drop(localId)
      return
    }
    setState(localId, { kind: 'remove-failed', attachmentId, error: t('Could not remove the attachment. Try again.') })
    setNotice(t('Could not remove {name}. Try again.', { name: item.fileName }))
  }

  return {
    pending,
    notice,
    add,
    remove,
    blocker: sendBlocker(pending),
    /** 送信する添付を取り出して入力欄から外す。送れる状態（blocker が null）のときだけ呼ぶ。送信に失敗したら restoreLastSent で戻す */
    takeForSend: () => {
      const ready = pending.flatMap(item => (item.state.kind === 'ready' ? [{ item, attachmentId: item.state.attachmentId }] : []))
      lastSentRef.current = ready.map(({ item }) => item)
      sentPreviewUrlsRef.current.push(...ready.flatMap(({ item }) => (item.previewUrl ? [item.previewUrl] : [])))
      setPending([])
      setNotice(null)
      return {
        attachmentIds: ready.map(({ attachmentId }) => attachmentId),
        displayAttachments: ready.map<Attachment>(({ item }) => ({ name: item.fileName, contentType: item.mimeType, url: item.previewUrl ?? '' })),
      }
    },
    restoreLastSent: () => {
      const restored = lastSentRef.current
      lastSentRef.current = []
      // 入力欄へ戻した添付のプレビューは、また入力欄で使う
      const restoredUrls = new Set(restored.flatMap(item => (item.previewUrl ? [item.previewUrl] : [])))
      sentPreviewUrlsRef.current = sentPreviewUrlsRef.current.filter(url => !restoredUrls.has(url))
      if (restored.length > 0) setPending(prev => [...restored, ...prev])
    },
    /** 送信済みのメッセージが保存した添付のリンクに置き換わった。送ったときのプレビューを解放する */
    releaseSentPreviews: () => {
      for (const url of sentPreviewUrlsRef.current) revoke(url)
      sentPreviewUrlsRef.current = []
    },
    /** 送信が成功したとき（戻す必要がなくなった） */
    clearLastSent: () => { lastSentRef.current = [] },
  }
}

