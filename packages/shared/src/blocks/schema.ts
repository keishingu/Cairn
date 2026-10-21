// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// カード型メッセージ（Slack Block Kit のサブセット）の受理判定。
// サーバーはこのスキーマに合わない blocks を chat.postMessage / chat.update / views.open で invalid_blocks にする。
// 「描けるものだけを受け付ける」ため、未知のブロック・要素・フィールドはすべて拒否する（docs/app-platform-design.md §4.4）。
// 要素を足すときは Web とネイティブの描画を先に出し、OTA が行き渡ってから BLOCKS_SCHEMA_VERSION を上げて受理する。

import { z } from 'zod'

/** message_blocks.schema_version に記録する、受理に使ったスキーマの版 */
export const BLOCKS_SCHEMA_VERSION = 1

// 上限は Slack に合わせる。Bolt アプリが Slack で通る blocks をそのまま送れるようにするため
export const BLOCK_LIMITS = {
  messageBlocks: 50,
  modalBlocks: 100,
  text: 3000,
  sectionFields: 10,
  sectionFieldText: 2000,
  actionsElements: 25,
  contextElements: 10,
  blockId: 255,
  actionId: 255,
  buttonText: 75,
  buttonValue: 2000,
  url: 3000,
  selectOptions: 100,
  optionText: 75,
  optionValue: 150,
  placeholder: 150,
  headerText: 150,
  altText: 2000,
  imageTitle: 2000,
  inputLabel: 2000,
  inputHint: 2000,
  confirmTitle: 100,
  confirmText: 300,
  confirmButton: 30,
  modalTitle: 24,
  modalButton: 24,
  privateMetadata: 3000,
  callbackId: 255,
} as const

/** https の URL だけを通す。http は Web では混在コンテンツ、iOS では ATS で表示できない（§11 D9） */
// shared は DOM / Node の型を持たず、React Native の URL 実装も不完全なため正規表現で判定する。
// ホストはドメイン名（ASCII。国際化ドメインは punycode）・IPv4・[IPv6] だけ、ポートは数字だけを許し、
// 壊れた URL（`https://example.com:invalid/`）や userinfo 付き（`https://example.com@evil.test`）を通さない
const DOMAIN_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
const HTTPS_URL = new RegExp(
  `^https://(?:${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*|\\[[0-9A-Fa-f:.]+\\])(?::(\\d{1,5}))?(?:[/?#]\\S*)?$`,
)

export function isHttpsUrl(value: string): boolean {
  const match = HTTPS_URL.exec(value)
  if (!match) return false
  const port = match[1]
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535)
}

const httpsUrl = (max: number) =>
  z.string().min(1).max(max).refine(isHttpsUrl, { message: 'https の URL を指定してください' })

const plainText = (max: number) =>
  z
    .object({
      type: z.literal('plain_text'),
      text: z.string().min(1).max(max),
      emoji: z.boolean().optional(),
    })
    .strict()

const mrkdwnText = (max: number) =>
  z
    .object({
      type: z.literal('mrkdwn'),
      text: z.string().min(1).max(max),
      verbatim: z.boolean().optional(),
    })
    .strict()

const textObject = (max: number) => z.discriminatedUnion('type', [plainText(max), mrkdwnText(max)])

const blockId = z.string().min(1).max(BLOCK_LIMITS.blockId)
const actionId = z.string().min(1).max(BLOCK_LIMITS.actionId)

const confirmSchema = z
  .object({
    title: plainText(BLOCK_LIMITS.confirmTitle),
    text: textObject(BLOCK_LIMITS.confirmText),
    confirm: plainText(BLOCK_LIMITS.confirmButton),
    deny: plainText(BLOCK_LIMITS.confirmButton),
    style: z.enum(['primary', 'danger']).optional(),
  })
  .strict()

const optionSchema = z
  .object({
    text: plainText(BLOCK_LIMITS.optionText),
    value: z.string().min(1).max(BLOCK_LIMITS.optionValue),
    description: plainText(BLOCK_LIMITS.optionText).optional(),
  })
  .strict()

export const buttonElementSchema = z
  .object({
    type: z.literal('button'),
    text: plainText(BLOCK_LIMITS.buttonText),
    action_id: actionId.optional(),
    value: z.string().min(1).max(BLOCK_LIMITS.buttonValue).optional(),
    url: httpsUrl(BLOCK_LIMITS.url).optional(),
    style: z.enum(['primary', 'danger']).optional(),
    confirm: confirmSchema.optional(),
  })
  .strict()

export const staticSelectElementSchema = z
  .object({
    type: z.literal('static_select'),
    action_id: actionId.optional(),
    placeholder: plainText(BLOCK_LIMITS.placeholder).optional(),
    options: z.array(optionSchema).min(1).max(BLOCK_LIMITS.selectOptions),
    initial_option: optionSchema.optional(),
    confirm: confirmSchema.optional(),
  })
  .strict()
  .superRefine((select, ctx) => {
    const values = select.options.map((option) => option.value)
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: '選択肢の value が重複しています' })
    }
    if (select.initial_option && !values.includes(select.initial_option.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initial_option'],
        message: 'initial_option は options のいずれかにしてください',
      })
    }
  })

export const imageElementSchema = z
  .object({
    type: z.literal('image'),
    image_url: httpsUrl(BLOCK_LIMITS.url),
    alt_text: z.string().min(1).max(BLOCK_LIMITS.altText),
  })
  .strict()

export const plainTextInputElementSchema = z
  .object({
    type: z.literal('plain_text_input'),
    action_id: actionId.optional(),
    placeholder: plainText(BLOCK_LIMITS.placeholder).optional(),
    initial_value: z.string().max(BLOCK_LIMITS.text).optional(),
    multiline: z.boolean().optional(),
    min_length: z.number().int().min(0).max(BLOCK_LIMITS.text).optional(),
    max_length: z.number().int().min(1).max(BLOCK_LIMITS.text).optional(),
  })
  .strict()
  .refine((input) => input.min_length === undefined || input.max_length === undefined || input.min_length <= input.max_length, {
    message: 'min_length は max_length 以下にしてください',
    path: ['min_length'],
  })

export const sectionBlockSchema = z
  .object({
    type: z.literal('section'),
    block_id: blockId.optional(),
    text: textObject(BLOCK_LIMITS.text).optional(),
    fields: z.array(textObject(BLOCK_LIMITS.sectionFieldText)).min(1).max(BLOCK_LIMITS.sectionFields).optional(),
    accessory: z.union([buttonElementSchema, staticSelectElementSchema, imageElementSchema]).optional(),
  })
  .strict()
  .refine((section) => section.text !== undefined || section.fields !== undefined, {
    message: 'section には text か fields が必要です',
  })

export const actionsBlockSchema = z
  .object({
    type: z.literal('actions'),
    block_id: blockId.optional(),
    elements: z.array(z.union([buttonElementSchema, staticSelectElementSchema])).min(1).max(BLOCK_LIMITS.actionsElements),
  })
  .strict()

export const contextBlockSchema = z
  .object({
    type: z.literal('context'),
    block_id: blockId.optional(),
    elements: z
      .array(z.union([imageElementSchema, plainText(BLOCK_LIMITS.text), mrkdwnText(BLOCK_LIMITS.text)]))
      .min(1)
      .max(BLOCK_LIMITS.contextElements),
  })
  .strict()

export const imageBlockSchema = z
  .object({
    type: z.literal('image'),
    block_id: blockId.optional(),
    image_url: httpsUrl(BLOCK_LIMITS.url),
    alt_text: z.string().min(1).max(BLOCK_LIMITS.altText),
    title: plainText(BLOCK_LIMITS.imageTitle).optional(),
  })
  .strict()

export const dividerBlockSchema = z
  .object({
    type: z.literal('divider'),
    block_id: blockId.optional(),
  })
  .strict()

export const headerBlockSchema = z
  .object({
    type: z.literal('header'),
    block_id: blockId.optional(),
    text: plainText(BLOCK_LIMITS.headerText),
  })
  .strict()

export const inputBlockSchema = z
  .object({
    type: z.literal('input'),
    block_id: blockId.optional(),
    label: plainText(BLOCK_LIMITS.inputLabel),
    element: z.union([plainTextInputElementSchema, staticSelectElementSchema]),
    hint: plainText(BLOCK_LIMITS.inputHint).optional(),
    optional: z.boolean().optional(),
  })
  .strict()

const MESSAGE_BLOCK_SCHEMAS = {
  section: sectionBlockSchema,
  actions: actionsBlockSchema,
  context: contextBlockSchema,
  image: imageBlockSchema,
  divider: dividerBlockSchema,
  header: headerBlockSchema,
} as const

const MODAL_BLOCK_SCHEMAS = { ...MESSAGE_BLOCK_SCHEMAS, input: inputBlockSchema } as const

/** 対応しているブロック種別。クライアントはこれ以外を「このバージョンでは表示できない」として扱う */
export const MESSAGE_BLOCK_TYPES = Object.keys(MESSAGE_BLOCK_SCHEMAS) as Array<keyof typeof MESSAGE_BLOCK_SCHEMAS>
export const MODAL_BLOCK_TYPES = Object.keys(MODAL_BLOCK_SCHEMAS) as Array<keyof typeof MODAL_BLOCK_SCHEMAS>

type SchemaMap = Record<string, z.ZodTypeAny>

/**
 * type でスキーマを引き当てる。z.union だと未知の種別も「Invalid input」としか返らず、アプリの開発者が原因を追えないため。
 * （refine 付きのスキーマは z.discriminatedUnion に渡せない）
 */
function blockByType<M extends SchemaMap>(schemas: M) {
  return z.unknown().transform((value, ctx): z.infer<M[keyof M]> => {
    const type = typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : undefined
    const schema = typeof type === 'string' && Object.prototype.hasOwnProperty.call(schemas, type) ? schemas[type] : undefined
    if (!schema) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: `未対応のブロック種別です: ${typeof type === 'string' ? type : String(type)}`,
      })
      return z.NEVER
    }
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue)
      return z.NEVER
    }
    return parsed.data
  })
}

const messageBlockSchema = blockByType(MESSAGE_BLOCK_SCHEMAS)
const modalBlockSchema = blockByType(MODAL_BLOCK_SCHEMAS)

export type SectionBlock = z.infer<typeof sectionBlockSchema>
export type ActionsBlock = z.infer<typeof actionsBlockSchema>
export type ContextBlock = z.infer<typeof contextBlockSchema>
export type ImageBlock = z.infer<typeof imageBlockSchema>
export type DividerBlock = z.infer<typeof dividerBlockSchema>
export type HeaderBlock = z.infer<typeof headerBlockSchema>
export type InputBlock = z.infer<typeof inputBlockSchema>
export type MessageBlock = z.infer<typeof messageBlockSchema>
export type ModalBlock = z.infer<typeof modalBlockSchema>
export type ButtonElement = z.infer<typeof buttonElementSchema>
export type StaticSelectElement = z.infer<typeof staticSelectElementSchema>
export type ImageElement = z.infer<typeof imageElementSchema>
export type PlainTextInputElement = z.infer<typeof plainTextInputElementSchema>
export type BlockOption = z.infer<typeof optionSchema>

type BlockWithElements = { block_id?: string | undefined; type: string; elements?: unknown[]; accessory?: unknown; element?: unknown }

/** block_id はブロック全体で、action_id はブロック内で一意にする（Slack と同じ。インタラクションの宛先を一意に決めるため） */
function refineUniqueIds(blocks: BlockWithElements[], ctx: z.RefinementCtx) {
  const blockIds = new Set<string>()
  blocks.forEach((block, blockIndex) => {
    if (block.block_id !== undefined) {
      if (blockIds.has(block.block_id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [blockIndex, 'block_id'], message: 'block_id が重複しています' })
      }
      blockIds.add(block.block_id)
    }
    const actionIds = new Set<string>()
    for (const [element, path] of interactiveElements(block)) {
      const id = (element as { action_id?: unknown }).action_id
      if (typeof id !== 'string') continue
      if (actionIds.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [blockIndex, ...path, 'action_id'], message: 'action_id が重複しています' })
      }
      actionIds.add(id)
    }
  })
}

function interactiveElements(block: BlockWithElements): Array<[unknown, Array<string | number>]> {
  const found: Array<[unknown, Array<string | number>]> = []
  if (block.type === 'actions') block.elements?.forEach((element, index) => found.push([element, ['elements', index]]))
  if (block.type === 'section' && block.accessory) found.push([block.accessory, ['accessory']])
  if (block.type === 'input' && block.element) found.push([block.element, ['element']])
  // 画像は操作できず action_id を持たない
  return found.filter(([element]) => (element as { type?: unknown }).type !== 'image')
}

export const messageBlocksSchema = z
  .array(messageBlockSchema)
  .min(1)
  .max(BLOCK_LIMITS.messageBlocks)
  .superRefine(refineUniqueIds)

export const modalBlocksSchema = z
  .array(modalBlockSchema)
  .min(1)
  .max(BLOCK_LIMITS.modalBlocks)
  .superRefine(refineUniqueIds)

export const modalViewSchema = z
  .object({
    type: z.literal('modal'),
    title: plainText(BLOCK_LIMITS.modalTitle),
    submit: plainText(BLOCK_LIMITS.modalButton).optional(),
    close: plainText(BLOCK_LIMITS.modalButton).optional(),
    blocks: modalBlocksSchema,
    private_metadata: z.string().max(BLOCK_LIMITS.privateMetadata).optional(),
    callback_id: z.string().min(1).max(BLOCK_LIMITS.callbackId).optional(),
  })
  .strict()
  .refine((view) => view.submit !== undefined || !view.blocks.some((block) => block.type === 'input'), {
    message: 'input を含むモーダルには submit が必要です',
    path: ['submit'],
  })

export type ModalView = z.infer<typeof modalViewSchema>

export type BlocksValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

/**
 * Slack の invalid_blocks と同じく `[ERROR] <理由> [json-pointer:/blocks/0/text]` の形でエラーを返す。
 * 省略された block_id / action_id は補う（Slack も自動で振る）。インタラクションの宛先を保存済み blocks から一意に引くため
 */
export function prepareMessageBlocks(input: unknown): BlocksValidationResult<MessageBlock[]> {
  return prepare(messageBlocksSchema, input, '/blocks')
}

export function prepareModalView(input: unknown): BlocksValidationResult<ModalView> {
  return prepare(modalViewSchema, input, '/view')
}

function prepare<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown, pointerRoot: string): BlocksValidationResult<T> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => formatIssue(issue, pointerRoot)) }
  }
  const value = parsed.data
  const blocks = Array.isArray(value) ? (value as BlockWithElements[]) : (value as { blocks: BlockWithElements[] }).blocks
  assignMissingIds(blocks)
  // 自動で振った ID が利用者の指定した ID と衝突していないかを、振った後にもう一度確かめる
  const recheck = schema.safeParse(value)
  if (!recheck.success) {
    return { ok: false, errors: recheck.error.issues.map((issue) => formatIssue(issue, pointerRoot)) }
  }
  return { ok: true, value: recheck.data }
}

function assignMissingIds(blocks: BlockWithElements[]) {
  blocks.forEach((block, blockIndex) => {
    if (block.block_id === undefined) block.block_id = `cairn-b${blockIndex}`
    interactiveElements(block).forEach(([element], elementIndex) => {
      const target = element as { action_id?: string }
      if (target.action_id === undefined) target.action_id = `cairn-a${elementIndex}`
    })
  })
}

function formatIssue(issue: z.ZodIssue, pointerRoot: string): string {
  const pointer = [pointerRoot, ...issue.path.map(String)].join('/')
  return `[ERROR] ${issue.message} [json-pointer:${pointer}]`
}
