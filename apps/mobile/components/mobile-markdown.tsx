// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { Platform, Text } from 'react-native'
import Markdown, { MarkdownIt, type RenderRules } from 'react-native-markdown-display'
import { matchMarkdownMention } from '../lib/mobile-chat-state'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'

const markdownParser = MarkdownIt({ breaks: true, linkify: true, typographer: true })

type MarkdownToken = {
  type: string
  content: string
  children?: MarkdownToken[] | null
}

type MarkdownState = {
  tokens: MarkdownToken[]
}

type MarkdownInlineState = {
  src: string
  pos: number
  push: (
    type: string,
    tag: string,
    nesting: number,
  ) => {
    meta: { userId: string; displayName?: string } | null
  }
}

markdownParser.inline.ruler.before(
  'autolink',
  'cairn-mention',
  (state: MarkdownInlineState, silent: boolean) => {
    const mention = matchMarkdownMention(state.src, state.pos)
    if (!mention) return false
    if (!silent) {
      const token = state.push('cairn_mention', '', 0)
      token.meta = {
        userId: mention.userId,
        ...(mention.displayName ? { displayName: mention.displayName } : {}),
      }
    }
    state.pos += mention.length
    return true
  },
)

markdownParser.core.ruler.after('inline', 'cairn-task-list', (state: MarkdownState) => {
  let listItemDepth = 0
  for (const token of state.tokens) {
    if (token.type === 'list_item_open') listItemDepth += 1
    if (token.type === 'list_item_close') listItemDepth -= 1
    if (token.type !== 'inline') continue

    for (const child of token.children ?? []) {
      if (child.type !== 'text') continue
      if (listItemDepth > 0) {
        child.content = child.content.replace(/^\[([ xX])\]\s+/, (_, checked: string) =>
          checked.trim() ? '☑ ' : '☐ ',
        )
      }
    }
  }
})

export const MobileMarkdown = React.memo(function MobileMarkdown({
  content,
  palette,
  onLinkPress,
  mentionNames,
}: {
  content: string
  palette: ThemePalette
  onLinkPress: (url: string) => boolean
  mentionNames?: Readonly<Record<string, string>>
}) {
  const t = useT()
  const rules = React.useMemo<RenderRules>(
    () => ({
      cairn_mention: (node, _children, _parents, styles, inheritedStyles = {}) => {
        const mention = (
          node as typeof node & {
            sourceMeta: { userId: string; displayName?: string }
          }
        ).sourceMeta
        return (
          <Text
            key={node.key}
            style={[
              inheritedStyles,
              styles.text,
              {
                color: palette.accentText,
                backgroundColor: palette.accentSoft,
                fontWeight: '600',
                borderRadius: 4,
                paddingHorizontal: 4,
              },
            ]}
          >
            @{mentionNames?.[mention.userId] ?? mention.displayName ?? t('Members')}
          </Text>
        )
      },
      // チャット画像は認証付き添付として別UIで描画する。外部URLを自動取得しない。
      image: () => null,
    }),
    [mentionNames, palette.accentSoft, palette.accentText, t],
  )
  const markdownStyle = React.useMemo(
    () => ({
      body: { color: palette.text2, fontSize: 14, lineHeight: 22 },
      text: { color: palette.text2, fontSize: 14, lineHeight: 22 },
      textgroup: { color: palette.text2, fontSize: 14, lineHeight: 22 },
      paragraph: {
        marginTop: 0,
        marginBottom: 4,
        flexWrap: 'wrap' as const,
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        width: '100%' as const,
      },
      heading1: {
        color: palette.text,
        fontSize: 18,
        fontWeight: '700' as const,
        lineHeight: 24,
        marginTop: 8,
        marginBottom: 4,
      },
      heading2: {
        color: palette.text,
        fontSize: 16,
        fontWeight: '700' as const,
        lineHeight: 22,
        marginTop: 6,
        marginBottom: 3,
      },
      heading3: {
        color: palette.text,
        fontSize: 14,
        fontWeight: '700' as const,
        lineHeight: 20,
        marginTop: 4,
        marginBottom: 2,
      },
      heading4: { color: palette.text, fontSize: 14, fontWeight: '700' as const },
      heading5: { color: palette.text, fontSize: 13, fontWeight: '700' as const },
      heading6: { color: palette.text3, fontSize: 12, fontWeight: '700' as const },
      strong: { color: palette.text, fontWeight: '700' as const },
      em: { fontStyle: 'italic' as const },
      s: { color: palette.text4, textDecorationLine: 'line-through' as const },
      blockquote: {
        backgroundColor: palette.card2,
        borderColor: palette.border,
        borderLeftWidth: 3,
        borderRadius: 4,
        marginVertical: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
      },
      bullet_list: { marginVertical: 2 },
      ordered_list: { marginVertical: 2 },
      list_item: { flexDirection: 'row' as const, justifyContent: 'flex-start' as const },
      bullet_list_icon: { color: palette.text3, marginLeft: 4, marginRight: 8 },
      ordered_list_icon: { color: palette.text3, marginLeft: 4, marginRight: 8 },
      bullet_list_content: { flex: 1 },
      ordered_list_content: { flex: 1 },
      code_inline: {
        color: palette.text,
        backgroundColor: palette.card2,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 3,
        paddingHorizontal: 4,
        paddingVertical: 1,
        fontSize: 12.5,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      },
      code_block: {
        color: palette.text2,
        backgroundColor: palette.card2,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginVertical: 4,
        fontSize: 12.5,
        lineHeight: 19,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      },
      fence: {
        color: palette.text2,
        backgroundColor: palette.card2,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginVertical: 4,
        fontSize: 12.5,
        lineHeight: 19,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      },
      table: { borderWidth: 1, borderColor: palette.border, borderRadius: 6, marginVertical: 6 },
      tr: { borderBottomWidth: 1, borderColor: palette.divider, flexDirection: 'row' as const },
      th: { flex: 1, backgroundColor: palette.card2, paddingHorizontal: 6, paddingVertical: 5 },
      td: { flex: 1, paddingHorizontal: 6, paddingVertical: 5 },
      link: { color: palette.accentText, textDecorationLine: 'underline' as const },
      hr: { backgroundColor: palette.divider, height: 1, marginVertical: 8 },
    }),
    [palette],
  )

  return (
    <Markdown
      markdownit={markdownParser}
      onLinkPress={onLinkPress}
      rules={rules}
      style={markdownStyle}
    >
      {content}
    </Markdown>
  )
})
