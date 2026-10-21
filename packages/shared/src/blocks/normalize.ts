// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 保存済みの blocks を、Web とネイティブが描くだけの中間表現にする。
// サーバーは新しい版のスキーマで受理しているので、古いクライアントは知らないブロック・要素・フィールドに出会い得る。
// それを黙って消さず `unsupported` として返し、描画側は「このバージョンでは表示できません」を出す（docs/app-platform-design.md §4.4）。

import type { z } from 'zod'
import { parseMrkdwn, type MrkdwnBlock } from './mrkdwn'
import {
  actionsBlockSchema,
  buttonElementSchema,
  contextBlockSchema,
  dividerBlockSchema,
  headerBlockSchema,
  imageBlockSchema,
  imageElementSchema,
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

export type RenderContextElement = { type: 'image'; url: string; alt: string } | { type: 'text'; text: RenderText } | RenderUnsupported

export type RenderUnsupported = { type: 'unsupported'; original: string }

export type RenderBlock =
  | { type: 'section'; blockId: string; text?: RenderText; fields: RenderText[]; accessory?: RenderElement }
  | { type: 'actions'; blockId: string; elements: RenderElement[] }
  | { type: 'context'; blockId: string; elements: RenderContextElement[] }
  | { type: 'image'; blockId: string; url: string; alt: string; title?: string }
  | { type: 'divider'; blockId: string }
  | { type: 'header'; blockId: string; text: string }
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
  const blocks = Array.isArray(input) ? input.map((block, index) => normalizeBlock(block, index)) : []
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
      return { type: 'actions', blockId, elements: elements.map((element, i) => normalizeActionElement(element, `${blockId}-${i}`)) }
    }
    case 'context': {
      const elements = containerElements(raw)
      if (!elements) return unsupported(type, blockId)
      return { type: 'context', blockId, elements: elements.map(normalizeContextElement) }
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
  if (type === 'plain_text' || type === 'mrkdwn') {
    // context の text 要素は section と同じ text object。section のスキーマを借りて検証する
    const parsed = parse(contextBlockSchema, { type: 'context', elements: [raw] })
    const element = parsed?.elements[0]
    if (element && element.type !== 'image') return { type: 'text', text: renderText(element) }
  }
  return unsupportedElement(raw)
}

// actions / context の枠そのものを検証する。要素は1つずつ寛容に見るが、枠に知らないフィールドがあれば
// 新しい版の機能を黙って落とさないよう、ブロックごと unsupported にする
const CONTAINER_KEYS = new Set(['type', 'block_id', 'elements'])

function containerElements(raw: unknown): unknown[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  if (Object.keys(raw).some((key) => !CONTAINER_KEYS.has(key))) return null
  const { block_id: id, elements } = raw as { block_id?: unknown; elements?: unknown }
  if (id !== undefined && typeof id !== 'string') return null
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
  return { type: 'unsupported', original: typeOf(raw) }
}
