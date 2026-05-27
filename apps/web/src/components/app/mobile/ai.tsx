// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useChat } from 'ai/react'
import type { ToolInvocation } from 'ai'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MobileHeader } from './header'
import { Icon, TypingDots } from '../primitives'
import { isImeConfirmingEnter } from '@/lib/chat/ime'
import type { ConversationDto } from '@/app/api/ai/conversations/route'
import type { MessageDto } from '@/app/api/ai/conversations/[id]/messages/route'

const SUGGESTIONS = ['プロジェクトの進捗は？', 'メンバーのスキルを確認', '最新ファイルを要約して']

type RagSource = { sourceType: string; sourceId: string; name: string; fileType?: string; externalUrl?: string }

function MessageSources({ annotations, toolInvocations }: { annotations?: unknown[] | undefined; toolInvocations?: ToolInvocation[] | undefined }) {
  const ragAnnotation = annotations?.find(
    (a): a is { type: string; sources: RagSource[] } =>
      typeof a === 'object' && a !== null && (a as { type?: unknown }).type === 'rag-sources',
  )
  const sources: RagSource[] = (ragAnnotation as { sources?: RagSource[] })?.sources ?? []
  const searches = (toolInvocations ?? []).filter(t => t.toolName === 'webSearch' && (t.state === 'call' || t.state === 'result'))
  if (sources.length === 0 && searches.length === 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {sources.map(src => {
        const icon = src.sourceType === 'file' ? 'file' : src.sourceType === 'project' ? 'folder' : 'users'
        const href =
          src.sourceType === 'file'
            ? (src.fileType === 'link' && src.externalUrl ? src.externalUrl : `/api/attachments/${src.sourceId}`)
            : src.sourceType === 'project'
            ? `/projects?open=${src.sourceId}`
            : `/members/${src.sourceId}`
        const isExternal = src.sourceType === 'file' && src.fileType === 'link'
        return (
          <a key={`${src.sourceType}:${src.sourceId}`} href={href}
            target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, textDecoration: 'none' }}>
            <Icon name={icon} size={10} strokeWidth={2}/>{src.name}
          </a>
        )
      })}
      {searches.map(t => {
        const query = String((t.args as { query?: string }).query ?? 'Web検索')
        const firstUrl = t.state === 'result' ? ((t.result as { results?: Array<{ url: string }> })?.results?.[0]?.url) : undefined
        return firstUrl ? (
          <a key={t.toolCallId} href={firstUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, textDecoration: 'none' }}>
            <Icon name="search" size={10} strokeWidth={2}/>{query}
          </a>
        ) : (
          <span key={t.toolCallId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11 }}>
            <Icon name="search" size={10} strokeWidth={2}/>{query}
          </span>
        )
      })}
    </div>
  )
}

function MobileChatView({ conversationId, initialMessages }: { conversationId: string; initialMessages: MessageDto[] }) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [isComposing, setIsComposing] = React.useState(false)
  const { messages, input, handleInputChange, handleSubmit, append, isLoading, error } = useChat({
    api: `/api/ai/conversations/${conversationId}/messages`,
    id: conversationId,
    initialMessages: initialMessages.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })),
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    },
  })

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, isLoading])

  return (
    <>
      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--red-soft)', borderBottom: '1px solid var(--red-text)', color: 'var(--red-text)', fontSize: 12.5 }}>
          エラー: {error.message}
        </div>
      )}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>
            質問を入力して会話を始めましょう
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} style={{ display: 'flex', gap: 10, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', flexDirection: m.role === 'assistant' ? 'row' : undefined }}>
            {m.role === 'assistant' && (
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sparkles" size={15} color="#fff"/>
              </div>
            )}
            <div style={{ maxWidth: '80%' }}>
              <div style={{
                padding: '12px 14px',
                borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: m.role === 'user' ? 'var(--accent)' : 'var(--card)',
                color: m.role === 'user' ? 'var(--on-accent)' : 'var(--text)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
              {m.role === 'assistant' && (
                <MessageSources annotations={m.annotations as unknown[]} toolInvocations={m.toolInvocations}/>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="sparkles" size={15} color="#fff"/>
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px 18px 18px 4px' }}>
              <TypingDots/>
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', overflowX: 'auto' }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => void append({ role: 'user', content: s })}
              style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', borderRadius: 999, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '10px 14px' }}>
          <input
            value={input}
            onChange={handleInputChange}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={e => { if (e.key === 'Enter' && !isImeConfirmingEnter(e, isComposing)) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) } }}
            placeholder="AIに質問する…"
            disabled={isLoading}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: (input.trim() && !isLoading) ? 'var(--accent)' : 'var(--border-2)', color: (input.trim() && !isLoading) ? 'var(--on-accent)' : 'var(--text-4)', cursor: (input.trim() && !isLoading) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}
          >
            <Icon name="send" size={15}/>
          </button>
        </div>
      </form>
    </>
  )
}

export function MobileAI() {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const { data: conversations = [] } = useQuery<ConversationDto[]>({
    queryKey: ['ai-conversations'],
    queryFn: () => fetch('/api/ai/conversations').then(r => r.json()),
  })

  const { data: initialMessages } = useQuery<MessageDto[]>({
    queryKey: ['ai-messages', activeId],
    queryFn: () => fetch(`/api/ai/conversations/${activeId}/messages`).then(r => r.json()),
    enabled: !!activeId,
  })

  const createConversation = useMutation({
    mutationFn: () => fetch('/api/ai/conversations', { method: 'POST' }).then(r => r.json()) as Promise<ConversationDto>,
    onSuccess: (conv) => {
      queryClient.setQueryData<ConversationDto[]>(['ai-conversations'], prev => [conv, ...(prev ?? [])])
      setActiveId(conv.id)
    },
  })

  // 最新会話を自動選択
  React.useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0]!.id)
    }
  }, [conversations, activeId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <MobileHeader
        title="AIアシスタント"
        right={
          <button
            onClick={() => createConversation.mutate()}
            disabled={createConversation.isPending}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', opacity: createConversation.isPending ? 0.5 : 1 }}
          >
            <Icon name="plus" size={20}/>
          </button>
        }
      />
      {activeId && initialMessages ? (
        <MobileChatView key={activeId} conversationId={activeId} initialMessages={initialMessages}/>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={22} color="#fff"/>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
            プロジェクト・メンバー・ファイルの情報をもとに質問に答えます。
          </p>
          <button
            className="btn btn-primary"
            onClick={() => createConversation.mutate()}
            disabled={createConversation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: createConversation.isPending ? 0.6 : 1 }}
          >
            <Icon name="plus" size={13}/> 新しい会話を始める
          </button>
        </div>
      )}
    </div>
  )
}
