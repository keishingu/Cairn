// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 保存済みの blocks を、Web とネイティブが描くだけの中間表現にする。
// サーバーは新しい版のスキーマで受理しているので、古いクライアントは知らないブロック・要素・フィールドに出会い得る。
// それを黙って消さず `unsupported` として返し、描画側は「このバージョンでは表示できません」を出す（docs/app-platform-design.md §4.4）。

import type { z } from 'zod'
import { parseMrkdwn, type MrkdwnBlock } from './mrkdwn'
import {
  BLOCK_LIMITS,
  actionsBlockSchema,
  buttonElementSchema,
  contextBlockSchema,
  dividerBlockSchema,
  headerBlockSchema,
  imageBlockSchema,
  imageElementSchema,
  inputBlockSchema,
  markdownBlockSchema,
  meterElementSchema,
  sectionBlockSchema,
  staticSelectElementSchema,
  type ButtonElement,
  type ImageElement,
  type StaticSelectElement,
} from './schema'

export type RenderText = { kind: 'plain'; text: string } | { kind: 'mrkdwn'; blocks: MrkdwnBlock[] }

export type RenderConfirm = { title: string; text: RenderText; confirm: string; deny: string; style?: 'primary' | 'danger' }

export type RenderOption = { text: string; value: string; description?: string }

export type RenderElement =
  | {
      type: 'button'
      actionId: string
      text: string
      style?: 'primary' | 'danger'
      url?: string
      confirm?: RenderConfirm
    }
  | {
      type: 'static_select'
      actionId: string
      placeholder?: string
      options: RenderOption[]
      initialValue?: string
      confirm?: RenderConfirm
    }
  | { type: 'image'; url: string; alt: string }
  | RenderUnsupported

export type RenderContextElement =
  | { type: 'image'; url: string; alt: string }
  | { type: 'text'; text: RenderText }
  | { type: 'meter'; value: number; min: number; max: number; label?: string }
  | RenderUnsupported

export type RenderUnsupported = { type: 'unsupported'; original: string }

export type RenderBlock =
  | { type: 'section'; blockId: string; text?: RenderText; fields: RenderText[]; accessory?: RenderElement }
  | { type: 'actions'; blockId: string; elements: RenderElement[] }
  | { type: 'context'; blockId: string; elements: RenderContextElement[] }
  | { type: 'image'; blockId: string; url: string; alt: string; title?: string }
  | { type: 'divider'; blockId: string }
  | { type: 'header'; blockId: string; text: string }
  /** 標準の Markdown。描画側は普段のメッセージと同じ部品で描く（生の HTML は描かない） */
  | { type: 'markdown'; blockId: string; text: string }
  | (RenderUnsupported & { blockId: string })

export type RenderCard = {
  blocks: RenderBlock[]
  /** 一部でも描けないものがあれば true。描画側は更新を促す案内を出す */
  hasUnsupported: boolean
  /** 何も描けない。描画側はカードの代わりに代替テキスト（messages.content）と案内を出す */
  nothingRenderable: boolean
}

/** 保存値が壊れていても例外にせず、描けない部分を unsupported として返す（メッセージ一覧全体を落とさないため） */
export function normalizeMessageBlocks(input: unknown): RenderCard {
  // 壊れた保存値や、上限を広げた新しい版で受理された blocks でも、際限なく描かないよう上限で切り、残りがあれば案内にする
  const blocks = Array.isArray(input)
    ? withTruncation(input, BLOCK_LIMITS.messageBlocks, (block, index) => normalizeBlock(block, index), (index) =>
        unsupported(TRUNCATED, `cairn-truncated-${index}`),
      )
    : []
  if (Array.isArray(input)) markAmbiguousIds(blocks, input)
  const hasUnsupported = !Array.isArray(input) || blocks.some(containsUnsupported)
  const nothingRenderable = !blocks.some(isRenderable)
  return { blocks, hasUnsupported, nothingRenderable }
}

/** 描ける中身が1つでもあるか。要素がすべて未対応の actions / context は、枠だけで何も描けない */
function isRenderable(block: RenderBlock): boolean {
  switch (block.type) {
    case 'unsupported':
      return false
    case 'actions':
    case 'context':
      return block.elements.some((element) => element.type !== 'unsupported')
    default:
      return true
  }
}

function containsUnsupported(block: RenderBlock): boolean {
  switch (block.type) {
    case 'unsupported':
      return true
    case 'section':
      return block.accessory?.type === 'unsupported'
    case 'actions':
    case 'context':
      return block.elements.some((element) => element.type === 'unsupported')
    default:
      return false
  }
}

function normalizeBlock(raw: unknown, index: number): RenderBlock {
  const type = typeOf(raw)
  const blockId = blockIdOf(raw, index)
  switch (type) {
    case 'section': {
      // accessory だけが新しい要素でも、本文は描けるように accessory を外して検証する
      const { accessory, ...rest } = raw as { accessory?: unknown }
      const section = parse(sectionBlockSchema, rest)
      if (!section) return unsupported(type, blockId)
      return {
        type: 'section',
        blockId,
        ...(section.text ? { text: renderText(section.text) } : {}),
        fields: (section.fields ?? []).map(renderText),
        ...(accessory !== undefined ? { accessory: normalizeAccessory(accessory, `${blockId}-accessory`) } : {}),
      }
    }
    case 'actions': {
      const elements = containerElements(raw)
      if (!elements) return unsupported(type, blockId)
      return {
        type: 'actions',
        blockId,
        elements: withTruncation(elements, BLOCK_LIMITS.actionsElements, (element, i) => normalizeActionElement(element, `${blockId}-${i}`), () =>
          unsupportedElement(TRUNCATED),
        ),
      }
    }
    case 'context': {
      const elements = containerElements(raw)
      if (!elements) return unsupported(type, blockId)
      return {
        type: 'context',
        blockId,
        elements: withTruncation(elements, BLOCK_LIMITS.contextElements, normalizeContextElement, () => unsupportedElement(TRUNCATED)),
      }
    }
    case 'image': {
      const image = parse(imageBlockSchema, raw)
      if (!image) return unsupported(type, blockId)
      return { type: 'image', blockId, url: image.image_url, alt: image.alt_text, ...(image.title ? { title: image.title.text } : {}) }
    }
    case 'divider':
      return parse(dividerBlockSchema, raw) ? { type: 'divider', blockId } : unsupported(type, blockId)
    case 'header': {
      const header = parse(headerBlockSchema, raw)
      return header ? { type: 'header', blockId, text: header.text.text } : unsupported(type, blockId)
    }
    case 'markdown': {
      const markdown = parse(markdownBlockSchema, raw)
      return markdown ? { type: 'markdown', blockId, text: markdown.text } : unsupported(type, blockId)
    }
    default:
      return unsupported(type, blockId)
  }
}

function normalizeAccessory(raw: unknown, fallbackId: string): RenderElement {
  if (typeOf(raw) === 'image') {
    const image = parse(imageElementSchema, raw)
    return image ? imageElement(image) : unsupportedElement(raw)
  }
  return normalizeActionElement(raw, fallbackId)
}

function normalizeActionElement(raw: unknown, fallbackId: string): RenderElement {
  switch (typeOf(raw)) {
    case 'button': {
      const button = parse(buttonElementSchema, raw)
      return button ? buttonElement(button, fallbackId) : unsupportedElement(raw)
    }
    case 'static_select': {
      const select = parse(staticSelectElementSchema, raw)
      return select ? selectElement(select, fallbackId) : unsupportedElement(raw)
    }
    default:
      return unsupportedElement(raw)
  }
}

function normalizeContextElement(raw: unknown): RenderContextElement {
  const type = typeOf(raw)
  if (type === 'image') {
    const image = parse(imageElementSchema, raw)
    return image ? imageElement(image) : unsupportedElement(raw)
  }
  if (type === 'meter') {
    const meter = parse(meterElementSchema, raw)
    return meter ? { type: 'meter', value: meter.value, min: meter.min ?? 0, max: meter.max, ...(meter.label ? { label: meter.label } : {}) } : unsupportedElement(raw)
  }
  if (type === 'plain_text' || type === 'mrkdwn') {
    // context の text 要素は section と同じ text object。section のスキーマを借りて検証する
    const parsed = parse(contextBlockSchema, { type: 'context', elements: [raw] })
    const element = parsed?.elements[0]
    if (element && (element.type === 'plain_text' || element.type === 'mrkdwn')) return { type: 'text', text: renderText(element) }
  }
  return unsupportedElement(raw)
}

// actions / context の枠そのものを検証する。要素は1つずつ寛容に見るが、枠に知らないフィールドがあれば
// 新しい版の機能を黙って落とさないよう、ブロックごと unsupported にする
const CONTAINER_KEYS = new Set(['type', 'block_id', 'elements'])

/**
 * 受理時の refineUniqueIds と同じ一意性を、保存値にもかけ直す。壊れた保存値や新しい版の blocks で
 * block_id やブロック内の action_id が重複すると、押下をどのボタンに届けるか一意に決まらないため、
 * 重複したものは最初の1つも含めてすべて unsupported にする。
 * 重複は上限で切り捨てる前の保存値全体で数える（サーバーは保存値全体と照合するので、切り捨てた側にある重複も宛先を曖昧にする）
 */
function markAmbiguousIds(blocks: RenderBlock[], raw: unknown[]) {
  const blockIdCounts = countBy(raw.map((block, index) => blockIdOf(block, index)))
  blocks.forEach((block, index) => {
    if (block.type === 'unsupported') return
    if ((blockIdCounts.get(block.blockId) ?? 0) > 1) {
      blocks[index] = unsupported(block.type, block.blockId)
      return
    }
    if (block.type === 'actions') {
      const rawElements = (raw[index] as { elements: unknown[] }).elements
      const actionIdCounts = countBy(rawElements.map((element, i) => rawActionIdOf(element, `${block.blockId}-${i}`)))
      block.elements = block.elements.map((element) =>
        actionIdOf(element).some((id) => (actionIdCounts.get(id) ?? 0) > 1) ? unsupportedElement(element.type) : element,
      )
    }
  })
}

/** 正規化で補うのと同じ規則で、保存値の要素の action_id を求める */
function rawActionIdOf(element: unknown, fallbackId: string): string {
  const id = typeof element === 'object' && element !== null ? (element as { action_id?: unknown }).action_id : undefined
  return typeof id === 'string' ? id : fallbackId
}

function actionIdOf(element: RenderElement): string[] {
  return element.type === 'button' || element.type === 'static_select' ? [element.actionId] : []
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/** 上限を超えた分を切り捨てたことを表す。unsupported と同じく、描画側は更新を促す案内を出す */
export const TRUNCATED = 'truncated'

function withTruncation<T>(items: unknown[], limit: number, map: (item: unknown, index: number) => T, truncated: (index: number) => T): T[] {
  const mapped = items.slice(0, limit).map((item, index) => map(item, index))
  return items.length > limit ? [...mapped, truncated(limit)] : mapped
}

function containerElements(raw: unknown): unknown[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  if (Object.keys(raw).some((key) => !CONTAINER_KEYS.has(key))) return null
  const { block_id: id, elements } = raw as { block_id?: unknown; elements?: unknown }
  // 受理時のスキーマと同じく、空や長すぎる block_id は通さない（空を cairn-b<n> に置き換えると、押下時に保存値と一致しない）
  if (id !== undefined && (typeof id !== 'string' || id.length === 0 || id.length > BLOCK_LIMITS.blockId)) return null
  return Array.isArray(elements) && elements.length > 0 ? elements : null
}

function buttonElement(button: ButtonElement, fallbackId: string): RenderElement {
  return {
    type: 'button',
    actionId: button.action_id ?? fallbackId,
    text: button.text.text,
    ...(button.style ? { style: button.style } : {}),
    ...(button.url ? { url: button.url } : {}),
    ...(button.confirm ? { confirm: renderConfirm(button.confirm) } : {}),
  }
}

function selectElement(select: StaticSelectElement, fallbackId: string): RenderElement {
  return {
    type: 'static_select',
    actionId: select.action_id ?? fallbackId,
    ...(select.placeholder ? { placeholder: select.placeholder.text } : {}),
    options: select.options.map((option) => ({
      text: option.text.text,
      value: option.value,
      ...(option.description ? { description: option.description.text } : {}),
    })),
    ...(select.initial_option ? { initialValue: select.initial_option.value } : {}),
    ...(select.confirm ? { confirm: renderConfirm(select.confirm) } : {}),
  }
}

function imageElement(image: ImageElement): { type: 'image'; url: string; alt: string } {
  return { type: 'image', url: image.image_url, alt: image.alt_text }
}

function renderConfirm(confirm: NonNullable<ButtonElement['confirm']>): RenderConfirm {
  return {
    title: confirm.title.text,
    text: renderText(confirm.text),
    confirm: confirm.confirm.text,
    deny: confirm.deny.text,
    ...(confirm.style ? { style: confirm.style } : {}),
  }
}

function renderText(text: { type: 'plain_text'; text: string } | { type: 'mrkdwn'; text: string; verbatim?: boolean | undefined }): RenderText {
  if (text.type === 'plain_text') return { kind: 'plain', text: text.text }
  return { kind: 'mrkdwn', blocks: parseMrkdwn(text.text, { verbatim: text.verbatim ?? false }) }
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> | null {
  const result = schema.safeParse(value)
  return result.success ? result.data : null
}

function typeOf(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value)
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' ? type : 'unknown'
}

function blockIdOf(value: unknown, index: number): string {
  const id = typeof value === 'object' && value !== null ? (value as { block_id?: unknown }).block_id : undefined
  return typeof id === 'string' && id ? id : `cairn-b${index}`
}

function unsupported(original: string, blockId: string): RenderUnsupported & { blockId: string } {
  return { type: 'unsupported', original, blockId }
}

function unsupportedElement(raw: unknown): RenderUnsupported {
  // 文字列は原因（truncated）や元の種別をそのまま記録する
  return { type: 'unsupported', original: typeof raw === 'string' ? raw : typeOf(raw) }
}

export type RenderInputElement =
  | {
      type: 'plain_text_input'
      actionId: string
      placeholder?: string
      initialValue?: string
      multiline: boolean
      minLength?: number
      maxLength?: number
    }
  | { type: 'static_select'; actionId: string; placeholder?: string; options: RenderOption[]; initialValue?: string }

export type RenderModalBlock =
  | RenderBlock
  | { type: 'input'; blockId: string; label: string; hint?: string; optional: boolean; element: RenderInputElement }

export type RenderModal = {
  title: string
  submit?: string
  close?: string
  blocks: RenderModalBlock[]
  /**
   * 描けない部分がある。入力欄が欠けたまま送ると、アプリが受け取るべき値を黙って落とすことになるため、
   * 描画側は送信を止めて更新を促す
   */
  hasUnsupported: boolean
}

/**
 * アプリが開いたモーダル（views.open で受理済み）を描画用の形にする。カードと同じく、知らない要素は黙って消さず unsupported にする。
 * タイトルすら読めない壊れた保存値は null（描画側はエラーを出して閉じられるようにする）
 */
export function normalizeModalView(view: unknown): RenderModal | null {
  if (typeof view !== 'object' || view === null) return null
  const raw = view as { title?: unknown; submit?: unknown; close?: unknown; blocks?: unknown }
  const title = plainTextOf(raw.title)
  if (title === undefined) return null
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : []
  const blocks: RenderModalBlock[] = withTruncation(
    rawBlocks,
    BLOCK_LIMITS.modalBlocks,
    (block, index): RenderModalBlock => (typeOf(block) === 'input' ? normalizeInputBlock(block, index) : normalizeBlock(block, index)),
    (index) => unsupported(TRUNCATED, `cairn-truncated-${index}`),
  )
  // カードと同じく、宛先が一意に決まらない ID は unsupported にする（入力欄も block_id で値を返すため対象）
  markAmbiguousIds(blocks as RenderBlock[], rawBlocks)
  const hasUnsupported = !Array.isArray(raw.blocks) || blocks.some((block) => (block.type === 'input' ? false : containsUnsupported(block)))
  const submit = plainTextOf(raw.submit)
  const close = plainTextOf(raw.close)
  return { title, ...(submit !== undefined ? { submit } : {}), ...(close !== undefined ? { close } : {}), blocks, hasUnsupported }
}

function normalizeInputBlock(raw: unknown, index: number): RenderModalBlock {
  const blockId = blockIdOf(raw, index)
  const input = parse(inputBlockSchema, raw)
  if (!input) return unsupported('input', blockId)
  const element = input.element
  const actionId = element.action_id ?? `${blockId}-input`
  const base = { type: 'input' as const, blockId, label: input.label.text, ...(input.hint ? { hint: input.hint.text } : {}), optional: input.optional ?? false }
  if (element.type === 'plain_text_input') {
    return {
      ...base,
      element: {
        type: 'plain_text_input',
        actionId,
        multiline: element.multiline ?? false,
        ...(element.placeholder ? { placeholder: element.placeholder.text } : {}),
        ...(element.initial_value !== undefined ? { initialValue: element.initial_value } : {}),
        ...(element.min_length !== undefined ? { minLength: element.min_length } : {}),
        ...(element.max_length !== undefined ? { maxLength: element.max_length } : {}),
      },
    }
  }
  return {
    ...base,
    element: {
      type: 'static_select',
      actionId,
      options: element.options.map((option) => ({ text: option.text.text, value: option.value, ...(option.description ? { description: option.description.text } : {}) })),
      ...(element.placeholder ? { placeholder: element.placeholder.text } : {}),
      ...(element.initial_option ? { initialValue: element.initial_option.value } : {}),
    },
  }
}

function plainTextOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const text = (value as { type?: unknown; text?: unknown })
  return text.type === 'plain_text' && typeof text.text === 'string' && text.text.length > 0 ? text.text : undefined
}

