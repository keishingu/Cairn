// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { UNKNOWN_MENTION_NAME } from '@/lib/chat/mentions'

// 構造化メンション。canonical な `<@userId>` と旧形式 `<@userId|displayName>` の両方を受理する
const STRUCTURED_MENTION_RE = /<@([^|>\s]+)(?:\|([^>\n]+))?>/g
const URL_RE = /https?:\/\/[^\s<>"']+/g
// AI の過去回答に Markdown 化されず残っている内部パスも遷移可能にする。
// 対象はアプリが evidence.href として返す画面・添付ファイルのパスに限定する。
const INTERNAL_HREF_RE = /\/(?:projects|tasks)(?:\?[^\s<>"']+)?|\/(?:chats|members|api\/attachments)\/[^\s<>"']+/g

// 長いURL（クエリパラメータ付きなど）は短縮URLにせず見た目だけ「…」で省略する。リンク先(href)は元のまま
const URL_DISPLAY_MAX = 50
function truncateUrlForDisplay(url: string): string {
  return url.length > URL_DISPLAY_MAX ? `${url.slice(0, URL_DISPLAY_MAX)}…` : url
}

function internalHrefLabel(href: string): string {
  if (href.startsWith('/projects')) return 'プロジェクトを開く'
  if (href.startsWith('/tasks')) return 'タスクを開く'
  if (href.startsWith('/chats')) return 'メッセージを開く'
  if (href.startsWith('/members')) return 'メンバーを開く'
  return 'ファイルを開く'
}

function renderInlineText(text: string, mentionNames?: Map<string, string>): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  const re = new RegExp(`${STRUCTURED_MENTION_RE.source}|${URL_RE.source}|${INTERNAL_HREF_RE.source}`, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]!
    if (token.startsWith('<@')) {
      // 現在の表示名を優先し、無ければ旧データの埋め込み名、それも無ければフォールバック
      const mentionedId = match[1]!
      const embeddedName = match[2]
      const displayName = mentionNames?.get(mentionedId) ?? embeddedName ?? UNKNOWN_MENTION_NAME
      nodes.push(
        <span key={match.index} style={{ display: 'inline', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 4, padding: '1px 5px', fontWeight: 600, fontSize: '0.92em' }}>
          @{displayName}
        </span>,
      )
    } else {
      const url = token.replace(/[.,;:!?)>\]。、，；：！？）〉》】］]+$/, '')
      const isInternal = url.startsWith('/')
      nodes.push(
        <a key={match.index} href={url}
          target={isInternal ? undefined : '_blank'} rel={isInternal ? undefined : 'noopener noreferrer'}
          style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere' }}>
          {isInternal ? internalHrefLabel(url) : truncateUrlForDisplay(url)}
        </a>,
      )
      const trailingPunctuation = token.slice(url.length)
      if (trailingPunctuation) nodes.push(trailingPunctuation)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length === 0 ? text : nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : nodes
}

function processChildren(children: React.ReactNode, mentionNames?: Map<string, string>): React.ReactNode {
  if (typeof children === 'string') return renderInlineText(children, mentionNames)
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        const processed = renderInlineText(child, mentionNames)
        if (processed === child) return child
        return <React.Fragment key={i}>{processed}</React.Fragment>
      }
      return child
    })
  }
  return children
}

interface MarkdownContentProps {
  content: string
  fontSize?: number
  lineHeight?: number
  mentionNames?: Map<string, string> | undefined
  onCheckboxToggle?: (index: number, checked: boolean) => void
}

// メッセージ一覧では最大100件が同時に描画され、その各行で react-markdown（remark 一式）の
// パースが走る。入力欄のキーストロークなど親の再レンダーごとに全件を再パースするとモバイルの
// WebView ではメインスレッドが数百ms〜秒単位でブロックされ、スクロール・タブ切替が固まる。
// props が変わらない限り再パースしないよう React.memo でラップする（呼び出し側は onCheckboxToggle
// や mentionNames を安定参照で渡すこと）。
export const MarkdownContent = React.memo(function MarkdownContent({ content, fontSize = 13.5, lineHeight = 1.6, mentionNames, onCheckboxToggle }: MarkdownContentProps) {
  const checkboxCounter = React.useRef(0)
  checkboxCounter.current = 0

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => (
          <p style={{ margin: '0 0 4px', lineHeight }}>{processChildren(children, mentionNames)}</p>
        ),
        h1: ({ children }) => (
          <h1 style={{ fontSize: fontSize * 1.4, fontWeight: 700, margin: '8px 0 4px', lineHeight: 1.3 }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontSize: fontSize * 1.2, fontWeight: 700, margin: '6px 0 3px', lineHeight: 1.3 }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontSize: fontSize * 1.05, fontWeight: 700, margin: '4px 0 2px', lineHeight: 1.3 }}>{children}</h3>
        ),
        strong: ({ children }) => (
          <strong style={{ fontWeight: 700 }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em style={{ fontStyle: 'italic' }}>{children}</em>
        ),
        del: ({ children }) => (
          <del style={{ textDecoration: 'line-through', opacity: 0.6 }}>{children}</del>
        ),
        ul: ({ children }) => (
          <ul style={{ paddingLeft: 20, margin: '2px 0 4px', listStyleType: 'disc' }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ paddingLeft: 20, margin: '2px 0 4px', listStyleType: 'decimal' }}>{children}</ol>
        ),
        li: ({ children, ...props }) => {
          const isTask = 'className' in props && String(props.className).includes('task-list-item')
          return (
            <li
              style={{ marginBottom: 2, lineHeight, listStyleType: isTask ? 'none' : undefined }}
              {...(isTask ? { className: String(props.className) } : {})}
            >
              {processChildren(children, mentionNames)}
            </li>
          )
        },
        input: ({ type, checked }) => {
          if (type !== 'checkbox') return <input type={type} />
          const index = checkboxCounter.current++
          return (
            <input
              type="checkbox"
              defaultChecked={checked ?? false}
              disabled={!onCheckboxToggle}
              onChange={onCheckboxToggle ? e => onCheckboxToggle(index, e.target.checked) : undefined}
              style={{
                cursor: onCheckboxToggle ? 'pointer' : 'default',
                marginRight: 5,
                verticalAlign: 'middle',
                accentColor: 'var(--accent)',
              }}
            />
          )
        },
        a: ({ href, children }) => {
          // 自動リンク化された生URL（リンクテキスト=URL自体）だけ表示を省略する。
          // `[表示名](url)` のようにテキストを明示したリンクはそのまま表示する
          const linkText = typeof children === 'string'
            ? children
            : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string'
              ? children[0]
              : null
          const isInternal = href?.startsWith('/') ?? false
          const display = linkText !== null && linkText === href
            ? (isInternal ? internalHrefLabel(linkText) : truncateUrlForDisplay(linkText))
            : children
          return (
            <a href={href}
              target={isInternal ? undefined : '_blank'} rel={isInternal ? undefined : 'noopener noreferrer'}
              style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere' }}>
              {display}
            </a>
          )
        },
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-')
          if (isBlock) return <code className={className} style={{ fontSize: fontSize * 0.9, fontFamily: 'monospace' }}>{children}</code>
          return (
            <code style={{
              fontFamily: 'monospace', fontSize: fontSize * 0.9,
              background: 'var(--card-2)', padding: '1px 5px', borderRadius: 3,
              border: '1px solid var(--border)',
            }}>{children}</code>
          )
        },
        pre: ({ children }) => (
          <pre style={{
            background: 'var(--card-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', overflowX: 'auto',
            margin: '4px 0', fontSize: fontSize * 0.9, fontFamily: 'monospace', lineHeight: 1.5,
          }}>{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote style={{
            borderLeft: '3px solid var(--border-2)', paddingLeft: 10,
            margin: '4px 0', color: 'var(--text-3)', fontStyle: 'italic',
          }}>{children}</blockquote>
        ),
        hr: () => (
          <hr style={{ border: 'none', borderTop: '1px solid var(--divider)', margin: '8px 0' }} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
})
