// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { MrkdwnBlock, MrkdwnInline, RenderText } from '@cairn/shared'
import { useT } from '@/components/locale-provider'

// mrkdwn の解釈は packages/shared が持ち、ここはトークン列を描くだけにする（ネイティブと同じ結果にするため）

const mentionStyle: React.CSSProperties = {
  display: 'inline', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 4,
  padding: '1px 5px', fontWeight: 600, fontSize: '0.92em',
}

export function RenderTextView({ text, mentionNames }: { text: RenderText; mentionNames?: Map<string, string> | undefined }) {
  if (text.kind === 'plain') return <span style={{ whiteSpace: 'pre-wrap' }}>{text.text}</span>
  return <MrkdwnView blocks={text.blocks} mentionNames={mentionNames} />
}

export function MrkdwnView({ blocks, mentionNames }: { blocks: MrkdwnBlock[]; mentionNames?: Map<string, string> | undefined }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return <div key={index}><InlineNodes nodes={block.children} mentionNames={mentionNames} /></div>
          case 'quote':
            return (
              <blockquote key={index} style={{ borderLeft: '3px solid var(--border-2)', paddingLeft: 10, margin: '4px 0', color: 'var(--text-3)' }}>
                <InlineNodes nodes={block.children} mentionNames={mentionNames} />
              </blockquote>
            )
          case 'pre':
            return (
              <pre key={index} style={{
                background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
                overflowX: 'auto', margin: '4px 0', fontSize: '0.9em', fontFamily: 'monospace', lineHeight: 1.5,
              }}>{block.text}</pre>
            )
        }
      })}
    </>
  )
}

function InlineNodes({ nodes, mentionNames }: { nodes: MrkdwnInline[]; mentionNames?: Map<string, string> | undefined }) {
  const t = useT()
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return <React.Fragment key={index}>{node.text}</React.Fragment>
          case 'bold':
            return <strong key={index} style={{ fontWeight: 700 }}><InlineNodes nodes={node.children} mentionNames={mentionNames} /></strong>
          case 'italic':
            return <em key={index}><InlineNodes nodes={node.children} mentionNames={mentionNames} /></em>
          case 'strike':
            return <del key={index} style={{ opacity: 0.6 }}><InlineNodes nodes={node.children} mentionNames={mentionNames} /></del>
          case 'code':
            return (
              <code key={index} style={{
                fontFamily: 'monospace', fontSize: '0.9em', background: 'var(--card-2)', padding: '1px 5px',
                borderRadius: 3, border: '1px solid var(--border)',
              }}>{node.text}</code>
            )
          case 'link':
            return (
              <a key={index} href={node.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere' }}>
                {node.text}
              </a>
            )
          case 'mention':
            return <span key={index} style={mentionStyle}>@{mentionNames?.get(node.userId) ?? t('Unknown member')}</span>
          case 'broadcast':
            return <span key={index} style={mentionStyle}>@{node.target}</span>
          case 'break':
            return <br key={index} />
        }
      })}
    </>
  )
}
