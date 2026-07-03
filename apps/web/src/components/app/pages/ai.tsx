'use client'

import React from 'react'
import { useChat } from 'ai/react'
import type { JSONValue, ToolInvocation } from 'ai'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, TypingDots } from '../primitives'
import { MobileHeader } from '../mobile/header'
import { TopBar } from '../sidebar'
import { isImeConfirmingEnter } from '@/lib/chat/ime'
import type { ConversationDto } from '@/app/api/ai/conversations/route'
import type { MessageDto } from '@/app/api/ai/conversations/[id]/messages/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useCommand } from '@/lib/command-registry'

// ---- ソースチップ ----

type RagSource = { sourceType: string; sourceId: string; name: string; fileType?: string; externalUrl?: string }

function MessageSources({ annotations, toolInvocations }: {
  annotations?: unknown[] | undefined
  toolInvocations?: ToolInvocation[] | undefined
}) {
  const ragAnnotation = annotations?.find(
    (a): a is { type: string; sources: RagSource[] } =>
      typeof a === 'object' && a !== null && (a as { type?: unknown }).type === 'rag-sources',
  )
  const sources: RagSource[] = (ragAnnotation as { sources?: RagSource[] })?.sources ?? []
  const searches = (toolInvocations ?? []).filter(t => t.toolName === 'webSearch' && (t.state === 'call' || t.state === 'result'))

  if (sources.length === 0 && searches.length === 0) return null

  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, textDecoration: 'none', cursor: 'pointer' }}>
            <Icon name={icon} size={10} strokeWidth={2}/>{src.name}
          </a>
        )
      })}
      {searches.map(t => {
        const query = String((t.args as { query?: string }).query ?? 'Web検索')
        const firstUrl = t.state === 'result' ? ((t.result as { results?: Array<{ url: string }> })?.results?.[0]?.url) : undefined
        return firstUrl ? (
          <a key={t.toolCallId} href={firstUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, textDecoration: 'none', cursor: 'pointer' }}>
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

// ---- 会話サイドバー (PC) ----

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  isCreating,
}: {
  conversations: ConversationDto[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  isCreating: boolean
}) {
  const grouped: Record<string, ConversationDto[]> = {}
  const now = new Date()

  for (const c of conversations) {
    const d = new Date(c.createdAt)
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    const key = diffDays === 0 ? '今日' : diffDays <= 6 ? '今週' : '以前'
    ;(grouped[key] ??= []).push(c)
  }

  const groups = ['今日', '今週', '以前'].filter(g => grouped[g]?.length)

  return (
    <aside style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 14px 10px' }}>
        <button
          className="btn btn-primary"
          onClick={onNew}
          disabled={isCreating}
          style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, opacity: isCreating ? 0.6 : 1 }}
        >
          <Icon name="plus" size={13}/> 新しい会話
        </button>
      </div>
      <div style={{ padding: '0 8px 12px', overflow: 'auto', flex: 1 }}>
        {groups.length === 0 && (
          <div style={{ padding: '16px 10px', fontSize: 12, color: 'var(--text-4)', textAlign: 'center' }}>
            まだ会話がありません
          </div>
        )}
        {groups.map(group => (
          <React.Fragment key={group}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '8px 10px', textTransform: 'uppercase' }}>{group}</div>
            {(grouped[group] ?? []).map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: c.id === activeId ? 'var(--card-hover)' : 'transparent',
                  color: 'var(--text-2)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Icon name="chat" size={13} color="var(--text-3)"/>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title ?? '新しい会話'}
                </span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </aside>
  )
}

// ---- ウェルカム画面 ----

function WelcomeScreen({ onNew, isCreating, isMobile }: { onNew: () => void; isCreating: boolean; isMobile?: boolean }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <div style={{ width: isMobile ? 48 : 52, height: isMobile ? 48 : 52, borderRadius: isMobile ? 14 : 16, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sparkles" size={isMobile ? 22 : 26} color="#fff"/>
      </div>
      {isMobile ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
          プロジェクト・メンバー・ファイルの情報をもとに質問に答えます。
        </p>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>AIアシスタント</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.7 }}>
            プロジェクト・メンバー・ファイルの情報をもとに<br/>質問に答えます。
          </p>
        </div>
      )}
      <button
        className="btn btn-primary"
        onClick={onNew}
        disabled={isCreating}
        style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isCreating ? 0.6 : 1 }}
      >
        <Icon name="plus" size={13}/> 新しい会話を始める
      </button>
    </div>
  )
}

// ---- チャットビュー ----

const SUGGESTIONS = ['プロジェクトの進捗を教えて', 'メンバーのスキルを確認したい', 'ファイルの内容を要約して', '計画のリスクを洗い出して']

function ChatView({
  conversationId,
  initialMessages,
  isMobile,
}: {
  conversationId: string
  initialMessages: MessageDto[]
  isMobile?: boolean
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [isComposing, setIsComposing] = React.useState(false)

  const { messages, input, handleInputChange, handleSubmit, append, isLoading, error } = useChat({
    api: `/api/ai/conversations/${conversationId}/messages`,
    id: conversationId,
    initialMessages: initialMessages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      ...(m.annotations ? { annotations: m.annotations as JSONValue[] } : {}),
      ...(m.toolInvocations ? { toolInvocations: m.toolInvocations as ToolInvocation[] } : {}),
    })),
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    },
  })

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, isLoading])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {!isMobile && (
        <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={12} color="#fff"/>
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>AIアシスタント</span>
        </div>
      )}

      {error && (
        <div style={{ padding: `10px ${isMobile ? '16px' : '28px'}`, background: 'var(--red-soft)', borderBottom: '1px solid var(--red-text)', color: 'var(--red-text)', fontSize: 12.5 }}>
          エラー: {error.message}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '24px 0' }}>
        <div style={{ maxWidth: isMobile ? undefined : 760, margin: '0 auto', padding: isMobile ? '0 16px' : '0 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13, paddingTop: 40 }}>
              質問を入力して会話を始めましょう
            </div>
          )}
          {messages.map(m => m.role === 'user' ? (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ maxWidth: '78%', background: 'var(--card-hover)', border: '1px solid var(--border)', borderRadius: '14px 14px 4px 14px', padding: '10px 14px', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sparkles" size={14} color="#fff"/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                <MessageSources annotations={m.annotations} toolInvocations={m.toolInvocations}/>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 26, fontSize: 11 }}
                    onClick={() => navigator.clipboard.writeText(m.content)}
                  >
                    コピー
                  </button>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sparkles" size={14} color="#fff"/>
              </div>
              <div style={{ paddingTop: 6, color: 'var(--text-3)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <TypingDots/> 考えています…
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: isMobile ? '8px 16px' : '12px 28px 18px',
        paddingBottom: isMobile ? '8px' : '18px',
        background: isMobile ? 'var(--card)' : 'var(--bg)',
        borderTop: isMobile ? '1px solid var(--border)' : undefined,
      }}>
        <div style={isMobile ? undefined : { maxWidth: 760, margin: '0 auto' }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : undefined }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void append({ role: 'user', content: s })}
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                    background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)',
                    cursor: isLoading ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isLoading ? 0.5 : 1,
                    ...(isMobile ? { whiteSpace: 'nowrap', flexShrink: 0 } : {}),
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 14, padding: '10px 12px 10px 14px', boxShadow: 'var(--shadow-sm)' }}>
              <textarea
                value={input}
                onChange={handleInputChange}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isImeConfirmingEnter(e, isComposing)) { e.preventDefault(); handleSubmit() } }}
                placeholder={isMobile ? 'AIに質問する…' : '質問を入力 (Shift+Enterで改行)'}
                rows={1}
                disabled={isLoading}
                style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 13.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '4px 0', minHeight: 22, maxHeight: 120 }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                style={{
                  width: 32, height: 32, borderRadius: 10, border: 'none',
                  background: (input.trim() && !isLoading) ? 'var(--accent)' : 'var(--border-2)',
                  color: (input.trim() && !isLoading) ? 'var(--on-accent)' : 'var(--text-4)',
                  cursor: (input.trim() && !isLoading) ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name="arrowUp" size={14}/>
              </button>
            </div>
          </form>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-4)', textAlign: 'center' }}>
            AIは間違えることもあります。重要な判断はリーダーに相談してください。
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- メインコンポーネント ----

export function PageAI({ isMobile }: { isMobile?: boolean }) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [mobilePane, setMobilePane] = React.useState<'welcome' | 'list' | 'chat'>('welcome')

  const { data: conversations = [] } = useQuery<ConversationDto[]>({
    queryKey: ['ai-conversations'],
    queryFn: () => fetchWithAuth('/api/ai/conversations').then(r => r.json()),
  })

  const { data: initialMessages } = useQuery<MessageDto[]>({
    queryKey: ['ai-messages', activeId],
    queryFn: () => fetchWithAuth(`/api/ai/conversations/${activeId}/messages`).then(r => r.json()),
    enabled: !!activeId,
  })

  const createConversation = useMutation({
    mutationFn: () => fetchWithAuth('/api/ai/conversations', { method: 'POST' }).then(r => r.json()) as Promise<ConversationDto>,
    onSuccess: (conv) => {
      queryClient.setQueryData<ConversationDto[]>(['ai-conversations'], prev => [conv, ...(prev ?? [])])
      setActiveId(conv.id)
      if (isMobile) setMobilePane('chat')
    },

  })

  const selectConversation = (id: string) => {
    setActiveId(id)
    if (isMobile) setMobilePane('chat')
  }

  // ⌥N: 新規会話
  useCommand('ctx.create', () => createConversation.mutate())

  // ⌥↑↓（順送り）: 会話履歴（新しい順）を前/次へ
  const seekConversation = (dir: 'prev' | 'next') => {
    if (conversations.length === 0) return
    const ids = conversations.map(c => c.id)
    const idx = activeId ? ids.indexOf(activeId) : -1
    const nextIdx = idx === -1
      ? (dir === 'next' ? 0 : ids.length - 1)
      : Math.min(Math.max(idx + (dir === 'next' ? 1 : -1), 0), ids.length - 1)
    const nextId = ids[nextIdx]
    if (nextId && nextId !== activeId) selectConversation(nextId)
  }
  useCommand('seq.prev', () => seekConversation('prev'))
  useCommand('seq.next', () => seekConversation('next'))




  // ---- モバイル ----

  if (isMobile) {
    const newButton = (
      <button
        onClick={() => createConversation.mutate()}
        disabled={createConversation.isPending}
        style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', opacity: createConversation.isPending ? 0.5 : 1 }}
      >
        <Icon name="plus" size={20}/>
      </button>
    )

    if (mobilePane === 'chat' && activeId && initialMessages) {
      const title = conversations.find(c => c.id === activeId)?.title ?? 'AIアシスタント'
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)', paddingBottom: 'calc(65px + env(safe-area-inset-bottom))' }}>
          <MobileHeader title={title} onBack={() => setMobilePane('welcome')} right={newButton}/>
          <ChatView key={activeId} conversationId={activeId} initialMessages={initialMessages} isMobile/>
        </div>
      )
    }

    if (mobilePane === 'list') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
          <MobileHeader title="過去の会話" onBack={() => setMobilePane('welcome')} right={newButton}/>
          <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(65px + env(safe-area-inset-bottom))' }}>
            {conversations.map(c => (
              <button
                key={c.id}
                onClick={() => selectConversation(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--divider)',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="chat" size={16} color="var(--text-3)"/>
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}>
                  {c.title ?? '新しい会話'}
                </span>
                <Icon name="chevRight" size={16} color="var(--text-4)"/>
              </button>
            ))}
          </div>
        </div>
      )
    }

    // welcome pane（デフォルト）
    const historyButton = conversations.length > 0 ? (
      <button
        onClick={() => setMobilePane('list')}
        style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
      >
        <Icon name="clock" size={20}/>
      </button>
    ) : undefined
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        <MobileHeader title="AIアシスタント" right={historyButton}/>
        <WelcomeScreen onNew={() => createConversation.mutate()} isCreating={createConversation.isPending} isMobile/>
      </div>
    )
  }

  // ---- PC ----

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopBar title="AIアシスタント"/>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => createConversation.mutate()}
        isCreating={createConversation.isPending}
      />
      {activeId && initialMessages ? (
        <ChatView key={activeId} conversationId={activeId} initialMessages={initialMessages}/>
      ) : (
        <WelcomeScreen onNew={() => createConversation.mutate()} isCreating={createConversation.isPending}/>
      )}
      </div>
    </div>
  )
}
