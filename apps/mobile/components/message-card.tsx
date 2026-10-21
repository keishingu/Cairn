// アプリが投稿したカード（Block Kit サブセット）をネイティブで描く。
// 中間表現への変換は @cairn/shared の normalizeMessageBlocks、文字の平坦化は lib/message-card-text が持ち、
// ここは部品への写像だけにする（Web の MessageCard と解釈をずらさないため。docs/app-platform-design.md §4.3）。
// ネイティブモジュールを足さず既存の react-native の部品だけで描き、runtimeVersion を上げずに EAS Update で配信できるようにする。

import React from 'react'
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  mrkdwnToPlainText,
  normalizeMessageBlocks,
  parseMrkdwn,
  type RenderBlock,
  type RenderConfirm,
  type RenderContextElement,
  type RenderElement,
  type RenderText,
} from '@cairn/shared'
import type { ThemePalette } from '../lib/theme'
import { cardTextParagraphs, type TextParagraph, type TextRun } from '../lib/message-card-text'
import { useT } from './locale-provider'

/** 押下されたボタン・選ばれた選択肢。インタラクションの送信（実装順5）で使う */
export type CardAction =
  | { type: 'button'; blockId: string; actionId: string }
  | { type: 'static_select'; blockId: string; actionId: string; selectedOptionValue: string }

type CardContext = {
  palette: ThemePalette
  mentionNames: Map<string, string>
  onLinkPress: (url: string) => boolean
  onAction: ((action: CardAction) => void) | undefined
}

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' })

export function MessageCard({
  blocks,
  fallbackText,
  palette,
  mentionNames,
  onLinkPress,
  onAction,
}: {
  blocks: unknown
  /** messages.content（Slack の text）。カードが何も描けないときに代わりに出す */
  fallbackText: string
  palette: ThemePalette
  mentionNames: Map<string, string>
  onLinkPress: (url: string) => boolean
  /** 未指定なら操作できない表示にする。インタラクションの送信を実装するまでの間のため */
  onAction?: (action: CardAction) => void
}) {
  const t = useT()
  const card = React.useMemo(() => normalizeMessageBlocks(blocks), [blocks])
  const context: CardContext = { palette, mentionNames, onLinkPress, onAction }

  if (card.nothingRenderable) {
    return (
      <View style={styles.card}>
        {fallbackText.length > 0 && <CardText text={{ kind: 'mrkdwn', blocks: parseMrkdwn(fallbackText) }} context={context} />}
        <UnsupportedNotice palette={palette}>{t('This card cannot be shown in this version. Update the app to see it.')}</UnsupportedNotice>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      {card.blocks.map((block) => (
        <CardBlock key={block.blockId} block={block} context={context} />
      ))}
    </View>
  )
}

function CardBlock({ block, context }: { block: RenderBlock; context: CardContext }) {
  const { palette } = context
  switch (block.type) {
    case 'header':
      return <Text style={[styles.header, { color: palette.text }]}>{block.text}</Text>
    case 'section':
      return (
        <View style={styles.section}>
          <View style={styles.sectionBody}>
            {block.text && <CardText text={block.text} context={context} />}
            {block.fields.length > 0 && (
              <View style={styles.fields}>
                {block.fields.map((field, index) => (
                  <View key={index} style={styles.field}>
                    <CardText text={field} context={context} />
                  </View>
                ))}
              </View>
            )}
          </View>
          {block.accessory && <CardElement element={block.accessory} blockId={block.blockId} context={context} />}
        </View>
      )
    case 'actions':
      return (
        <View style={styles.actions}>
          {block.elements.map((element, index) => (
            <CardElement key={index} element={element} blockId={block.blockId} context={context} />
          ))}
        </View>
      )
    case 'context':
      return (
        <View style={styles.context}>
          {block.elements.map((element, index) => (
            <ContextElement key={index} element={element} context={context} />
          ))}
        </View>
      )
    case 'image':
      return (
        <View style={styles.imageBlock}>
          {block.title && <Text style={[styles.imageTitle, { color: palette.text3 }]}>{block.title}</Text>}
          <Image
            source={{ uri: block.url }}
            accessibilityLabel={block.alt}
            resizeMode="contain"
            style={[styles.image, { borderColor: palette.border, backgroundColor: palette.card2 }]}
          />
        </View>
      )
    case 'divider':
      return <View style={[styles.divider, { backgroundColor: palette.divider }]} />
    case 'unsupported':
      return <UnsupportedPart palette={palette} />
  }
}

function CardElement({ element, blockId, context }: { element: RenderElement; blockId: string; context: CardContext }) {
  const { palette, onAction, onLinkPress } = context
  switch (element.type) {
    case 'button': {
      const filled = element.style === 'primary' ? palette.accent : element.style === 'danger' ? palette.redText : null
      // URL ボタンはリンクとして開く。押下の通知（Slack は url ボタンでも block_actions を送る）は実装順5で足す
      const disabled = !element.url && !onAction
      return (
        <Pressable
          accessibilityRole={element.url ? 'link' : 'button'}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => {
            const url = element.url
            confirmThen(element.confirm, () => {
              if (url) onLinkPress(url)
              else onAction?.({ type: 'button', blockId, actionId: element.actionId })
            })
          }}
          style={({ pressed }) => [
            styles.button,
            filled ? { backgroundColor: filled, borderColor: filled } : { backgroundColor: palette.card, borderColor: palette.border },
            (pressed || disabled) && styles.buttonDimmed,
          ]}
        >
          <Text style={[styles.buttonText, { color: filled ? palette.onAccent : palette.text }]} numberOfLines={1}>
            {element.text}
          </Text>
        </Pressable>
      )
    }
    case 'static_select':
      // chat.update で初期選択が変わったら選び直した状態を捨てて新しい初期選択を表示する（key で作り直す）
      return <CardSelect key={element.initialValue ?? ''} element={element} blockId={blockId} context={context} />
    case 'image':
      return <Image source={{ uri: element.url }} accessibilityLabel={element.alt} style={styles.accessoryImage} />
    case 'unsupported':
      return <UnsupportedPart palette={palette} />
  }
}

function CardSelect({
  element,
  blockId,
  context,
}: {
  element: Extract<RenderElement, { type: 'static_select' }>
  blockId: string
  context: CardContext
}) {
  const t = useT()
  const { palette, onAction } = context
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState(element.initialValue)
  const label = element.options.find((option) => option.value === selected)?.text ?? element.placeholder ?? t('Choose an option')
  const disabled = !onAction
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.select, { backgroundColor: palette.card, borderColor: palette.border }, disabled && styles.buttonDimmed]}
      >
        <Text style={[styles.buttonText, { color: palette.text }]} numberOfLines={1}>{label}</Text>
        <Text style={{ color: palette.text3, fontSize: 10 }}>▼</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <ScrollView>
              {element.options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.value === selected }}
                  onPress={() => {
                    setOpen(false)
                    confirmThen(element.confirm, () => {
                      setSelected(option.value)
                      onAction?.({ type: 'static_select', blockId, actionId: element.actionId, selectedOptionValue: option.value })
                    })
                  }}
                  style={({ pressed }) => [styles.sheetOption, pressed && { backgroundColor: palette.cardHover }]}
                >
                  <Text style={{ color: option.value === selected ? palette.accentText : palette.text, fontSize: 15 }}>{option.text}</Text>
                  {option.description && <Text style={{ color: palette.text3, fontSize: 12 }}>{option.description}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

/**
 * アプリが confirm を指定したら、確認を挟んでから操作する（Slack と同じく確認を飛ばさない）。
 * 確認の本文は書式を落とした文字列にする（Alert は書式を描けない）
 */
function confirmThen(confirm: RenderConfirm | undefined, run: () => void) {
  if (!confirm) {
    run()
    return
  }
  const message = confirm.text.kind === 'plain'
    ? confirm.text.text
    : mrkdwnToPlainText(confirm.text.blocks, () => '')
  Alert.alert(confirm.title, message, [
    { text: confirm.deny, style: 'cancel' },
    { text: confirm.confirm, style: confirm.style === 'danger' ? 'destructive' : 'default', onPress: run },
  ])
}

function ContextElement({ element, context }: { element: RenderContextElement; context: CardContext }) {
  switch (element.type) {
    case 'image':
      return <Image source={{ uri: element.url }} accessibilityLabel={element.alt} style={styles.contextImage} />
    case 'text':
      return <CardText text={element.text} context={context} small />
    case 'unsupported':
      return <UnsupportedPart palette={context.palette} />
  }
}

function CardText({ text, context, small }: { text: RenderText; context: CardContext; small?: boolean }) {
  const t = useT()
  const { palette, mentionNames } = context
  const paragraphs = React.useMemo(
    () => cardTextParagraphs(text, (id) => mentionNames.get(id), t('@Member')),
    [text, mentionNames, t],
  )
  const base = small ? styles.smallText : styles.text
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <Paragraph key={index} paragraph={paragraph} base={[base, { color: small ? palette.text3 : palette.text2 }]} context={context} />
      ))}
    </>
  )
}

function Paragraph({ paragraph, base, context }: { paragraph: TextParagraph; base: React.ComponentProps<typeof Text>['style']; context: CardContext }) {
  const { palette } = context
  if (paragraph.type === 'pre') {
    return (
      <Text style={[styles.pre, { color: palette.text2, backgroundColor: palette.card2, borderColor: palette.border }]}>
        {paragraph.text}
      </Text>
    )
  }
  const runs = paragraph.runs.map((run, index) => <Run key={index} run={run} context={context} />)
  if (paragraph.type === 'quote') {
    return (
      <View style={[styles.quote, { borderLeftColor: palette.border }]}>
        <Text style={[base, { color: palette.text3 }]}>{runs}</Text>
      </View>
    )
  }
  return <Text style={base}>{runs}</Text>
}

function Run({ run, context }: { run: TextRun; context: CardContext }) {
  const { palette, onLinkPress } = context
  const style = [
    run.bold && styles.bold,
    run.italic && styles.italic,
    run.strike && styles.strike,
    run.code && [styles.code, { color: palette.text, backgroundColor: palette.card2 }],
    run.mention && { color: palette.accentText, backgroundColor: palette.accentSoft, fontWeight: '600' as const },
    run.url && { color: palette.accentText, textDecorationLine: 'underline' as const },
  ]
  const url = run.url
  if (url) {
    return <Text accessibilityRole="link" style={style} onPress={() => onLinkPress(url)}>{run.text}</Text>
  }
  return <Text style={style}>{run.text}</Text>
}

function UnsupportedPart({ palette }: { palette: ThemePalette }) {
  const t = useT()
  return <UnsupportedNotice palette={palette}>{t('This part of the card cannot be shown in this version. Update the app to see it.')}</UnsupportedNotice>
}

function UnsupportedNotice({ palette, children }: { palette: ThemePalette; children: React.ReactNode }) {
  return (
    <View accessibilityRole="text" style={[styles.notice, { borderColor: palette.border }]}>
      <Text style={[styles.smallText, { color: palette.text3 }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: 8, marginTop: 2 },
  header: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  section: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sectionBody: { flex: 1, minWidth: 0, gap: 6 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 16 },
  field: { minWidth: '40%', flexGrow: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  imageBlock: { gap: 4 },
  imageTitle: { fontSize: 12 },
  image: { width: '100%', height: 200, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  accessoryImage: { width: 56, height: 56, borderRadius: 8 },
  contextImage: { width: 16, height: 16, borderRadius: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  button: { minHeight: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  buttonText: { fontSize: 13, fontWeight: '600' },
  buttonDimmed: { opacity: 0.55 },
  select: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 14, borderWidth: 1, maxHeight: '70%', paddingVertical: 6 },
  sheetOption: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  text: { fontSize: 14, lineHeight: 22 },
  smallText: { fontSize: 12, lineHeight: 18 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: { fontFamily: MONOSPACE, fontSize: 12.5 },
  pre: { fontFamily: MONOSPACE, fontSize: 12.5, lineHeight: 19, borderWidth: 1, borderRadius: 8, padding: 8, overflow: 'hidden' },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  notice: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
})
