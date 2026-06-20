// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { UNKNOWN_MENTION_NAME } from '@/lib/chat/mentions'

// 構造化メンション。canonical な `<@userId>` と旧形式 `<@userId|displayName>` の両方を受理する
const STRUCTURED_MENTION_RE = /<@([^|>\s]+)(?:\|([^>\n]+))?>/g
const URL_RE = /https?:\/\/[^\s<>"']+/g

function renderInlineText(text: string, mentionNames?: Map<string, string>): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  const re = new RegExp(`${STRUCTURED_MENTION_RE.source}|${URL_RE.source}`, 'g')
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
      const url = token.replace(/[.,;:!?)>\]]+$/, '')
      nodes.push(
        <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {url}
        </a>,
      )
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

export function MarkdownContent({ content, fontSize = 13.5, lineHeight = 1.6, mentionNames, onCheckboxToggle }: MarkdownContentProps) {
  const checkboxCounter = React.useRef(0)
  checkboxCounter.current = 0

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {children}
          </a>
        ),
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
}
