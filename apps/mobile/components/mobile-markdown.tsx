// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { View } from 'react-native'
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
  type Md4cFlags,
} from 'react-native-enriched-markdown'
import {
  isMentionLink,
  MENTION_LINK_SCHEME,
  splitMermaidSegments,
  toEnrichedMarkdown,
} from '../lib/mobile-markdown-source'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'
import { MermaidDiagramCard } from './mermaid-diagram'

// 改行1つでも改行として見せる（Web の remark-breaks と同じ）。
// `$` は金額などで頻出するため数式として解釈しない。`> [!NOTE]` は Web と同じく通常の引用にする
const MD4C_FLAGS: Md4cFlags = {
  hardSoftBreaks: true,
  latexMath: false,
  admonitions: false,
}

export const MobileMarkdown = React.memo(function MobileMarkdown({
  content,
  palette,
  onLinkPress,
  mentionNames,
  onLongPress,
}: {
  content: string
  palette: ThemePalette
  onLinkPress: (url: string) => boolean
  mentionNames?: Readonly<Record<string, string>>
  // Mermaid 図のカードは独自にタップを受けるため、メッセージの長押しメニューを渡して塞がないようにする
  onLongPress?: () => void
}) {
  const t = useT()
  // Mermaid 図はネイティブの Markdown では描画できないため、本文から分けてタップで全画面表示する
  const segments = React.useMemo(
    () =>
      splitMermaidSegments(content).map((segment) =>
        segment.type === 'mermaid'
          ? segment
          : {
              type: 'markdown' as const,
              markdown: toEnrichedMarkdown(segment.content, {
                resolveMentionName: (userId, displayName) =>
                  mentionNames?.[userId] ?? displayName ?? t('Member'),
                imageLabel: t('Image'),
              }),
            },
      ),
    [content, mentionNames, t],
  )

  const handleLinkPress = React.useCallback(
    ({ url }: LinkPressEvent) => {
      // メンションは表示だけで、遷移先を持たない
      if (isMentionLink(url)) return
      onLinkPress(url)
    },
    [onLinkPress],
  )

  const markdownStyle = React.useMemo<MarkdownStyle>(
    () => ({
      paragraph: { color: palette.text2, fontSize: 14, lineHeight: 22, marginTop: 0, marginBottom: 4 },
      h1: { color: palette.text, fontSize: 18, fontWeight: '700', lineHeight: 24, marginTop: 8, marginBottom: 4 },
      h2: { color: palette.text, fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 6, marginBottom: 3 },
      h3: { color: palette.text, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 4, marginBottom: 2 },
      h4: { color: palette.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
      h5: { color: palette.text, fontSize: 13, fontWeight: '700', lineHeight: 20 },
      h6: { color: palette.text3, fontSize: 12, fontWeight: '700', lineHeight: 18 },
      strong: { color: palette.text },
      strikethrough: { color: palette.text4 },
      blockquote: {
        color: palette.text2,
        fontSize: 14,
        lineHeight: 22,
        backgroundColor: palette.card2,
        borderColor: palette.border,
        borderWidth: 3,
        borderRadius: 4,
        padding: 4,
        gapWidth: 10,
        marginTop: 4,
        marginBottom: 4,
      },
      list: {
        color: palette.text2,
        fontSize: 14,
        lineHeight: 22,
        bulletColor: palette.text3,
        markerColor: palette.text3,
        marginTop: 2,
        marginBottom: 2,
        gapWidth: 8,
      },
      code: {
        color: palette.text,
        backgroundColor: palette.card2,
        borderColor: palette.border,
        fontSize: 12.5,
      },
      codeBlock: {
        color: palette.text2,
        backgroundColor: palette.card2,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
        fontSize: 12.5,
        lineHeight: 19,
        marginTop: 4,
        marginBottom: 4,
      },
      table: {
        color: palette.text2,
        fontSize: 14,
        lineHeight: 20,
        headerBackgroundColor: palette.card2,
        headerTextColor: palette.text,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 6,
        cellPaddingHorizontal: 6,
        cellPaddingVertical: 5,
        marginTop: 6,
        marginBottom: 6,
      },
      taskList: {
        checkedColor: palette.accent,
        borderColor: palette.text3,
        checkmarkColor: palette.onAccent,
        checkedTextColor: palette.text3,
      },
      link: { color: palette.accentText, underline: true },
      linkVariants: {
        // Web と同じくアクセントの淡色背景で本文と区別する
        [`^${MENTION_LINK_SCHEME}`]: {
          color: palette.accentText,
          backgroundColor: palette.accentSoft,
          underline: false,
        },
      },
      thematicBreak: { color: palette.divider, height: 1, marginTop: 8, marginBottom: 8 },
    }),
    [palette],
  )

  const renderMarkdown = (markdown: string, key?: number) => (
    <EnrichedMarkdownText
      key={key}
      markdown={markdown}
      flavor="github"
      md4cFlags={MD4C_FLAGS}
      markdownStyle={markdownStyle}
      onLinkPress={handleLinkPress}
      // タスクリストは Web で編集する。アプリでは状態の表示だけにする
      enableTaskListItemToggle={false}
      // メッセージの長押しはアクションメニューに使うため、本文の選択・プレビュー・コピーメニューと競合させない
      selectable={false}
      enableLinkPreview={false}
      enableBlockContextMenu={false}
    />
  )

  if (segments.length === 1 && segments[0]!.type === 'markdown') return renderMarkdown(segments[0]!.markdown)
  return (
    <View>
      {segments.map((segment, index) =>
        segment.type === 'mermaid' ? (
          <MermaidDiagramCard
            key={index}
            definition={segment.definition}
            palette={palette}
            {...(onLongPress ? { onLongPress } : {})}
          />
        ) : (
          renderMarkdown(segment.markdown, index)
        ),
      )}
    </View>
  )
})
