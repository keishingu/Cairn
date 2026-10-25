// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// カード型メッセージ（Slack Block Kit のサブセット）の受理判定。
// サーバーはこのスキーマに合わない blocks を chat.postMessage / chat.update / views.open で invalid_blocks にする。
// 「描けるものだけを受け付ける」ため、未知のブロック・要素・フィールドはすべて拒否する（docs/app-platform-design.md §4.4）。
// 要素を足すときは Web とネイティブの描画を先に出し、OTA が行き渡ってから BLOCKS_SCHEMA_VERSION を上げて受理する。

import { z } from 'zod'

/** message_blocks.schema_version に記録する、受理に使ったスキーマの版 */
// 2: markdown ブロック（Slack と同じ形）と、Cairn 独自の context 要素 meter を足した
export const BLOCKS_SCHEMA_VERSION = 2

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
  /** メッセージ内の markdown ブロックの合計文字数（Slack と同じ） */
  markdownTotal: 12000,
  meterLabel: 2000,
} as const

/** https の URL だけを通す。http は Web では混在コンテンツ、iOS では ATS で表示できない（§11 D9） */
// shared は DOM / Node の型を持たず、React Native の URL 実装も不完全なため正規表現で判定する。
// ホストはドメイン名（ASCII。国際化ドメインは punycode）・IPv4・[IPv6] だけ、ポートは数字だけを許し、
// 壊れた URL（`https://example.com:invalid/`）や userinfo 付き（`https://example.com@evil.test`）を通さない
const DOMAIN_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
const HTTPS_URL = new RegExp(
  `^https://(${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*|\\[([0-9A-Fa-f:.]+)\\])(?::(\\d{1,5}))?(?:[/?#]\\S*)?$`,
)

export function isHttpsUrl(value: string): boolean {
  const match = HTTPS_URL.exec(value)
  if (!match) return false
  const [, host = '', ipv6, port] = match
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return false
  if (ipv6 !== undefined) return isIpv6(ipv6)
  // WHATWG URL は末尾のラベルが数字のホストを IPv4 として解釈し、不正なら読み込めない。数字で終わるなら正しい IPv4 だけを通す
  const labels = host.split('.')
  return /^\d+$/.test(labels[labels.length - 1] ?? '') ? isIpv4(labels) : true
}

/** 0〜255 の4つの10進数。先頭の 0 は WHATWG で8進数として扱われ見た目と違う宛先になるため拒否する */
function isIpv4(labels: string[]): boolean {
  return labels.length === 4 && labels.every((label) => /^(?:0|[1-9]\d{0,2})$/.test(label) && Number(label) <= 255)
}

/** 1〜4桁の16進数を8組（`::` で省略するなら8組未満）。末尾は IPv4（2組分）でもよい */
function isIpv6(literal: string): boolean {
  const halves = literal.split('::')
  if (halves.length > 2) return false
  const groupsOf = (part: string) => (part === '' ? [] : part.split(':'))
  const groups = [...groupsOf(halves[0]!), ...(halves.length === 2 ? groupsOf(halves[1]!) : [])]
  let count = 0
  for (const [index, group] of groups.entries()) {
    // IPv4 の組は、`::` の前後をつないだ並びではなく、リテラル全体の末尾にあるときだけ認める（`[192.0.2.1::]` を通さない）
    if (index === groups.length - 1 && group.includes('.') && !literal.endsWith('::') && literal.endsWith(group)) {
      if (!isIpv4(group.split('.'))) return false
      count += 2
    } else if (/^[0-9A-Fa-f]{1,4}$/.test(group)) {
      count += 1
    } else {
      return false
    }
  }
  return halves.length === 2 ? count < 8 : count === 8
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

// JavaScript のオブジェクトのキーとして特別な意味を持つ名前（__proto__ や constructor など）は ID にさせない。
// サーバー・Web・ネイティブで block_id / action_id をキーにした入れ物を作るため、どこかで1つでも普通のオブジェクトを使うと、
// 値が抜けたり継承した値を読んだりする
const RESERVED_IDS = new Set(['__proto__', ...Object.getOwnPropertyNames(Object.prototype)])
const notReservedId = (id: string) => !RESERVED_IDS.has(id)
const reservedIdMessage = 'この ID は使えません（__proto__ や constructor などオブジェクトの組み込みの名前）'
// 断るのは新しく受理するときだけ（prepare*）。描画（normalize）は同じスキーマで保存済みの値も読むので、ここでは拒まない
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
    // Slack と同じく、value だけでなく表示文・説明まで options のどれかと完全に一致させる。
    // value だけで照合すると、アプリが宣言した表示と違う選択肢の表示で描いてしまうため
    const initial = select.initial_option
    if (initial && !select.options.some((option) => sameOption(option, initial))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initial_option'],
        message: 'initial_option は options のいずれかにしてください',
      })
    }
  })

function sameOption(a: z.infer<typeof optionSchema>, b: z.infer<typeof optionSchema>): boolean {
  const key = (option: z.infer<typeof optionSchema>) =>
    JSON.stringify([option.value, option.text.text, option.text.emoji ?? null, option.description?.text ?? null, option.description?.emoji ?? null])
  return key(a) === key(b)
}

export const imageElementSchema = z
  .object({
    type: z.literal('image'),
    image_url: httpsUrl(BLOCK_LIMITS.url),
    alt_text: z.string().min(1).max(BLOCK_LIMITS.altText),
  })
  .strict()

/**
 * 量を表すバー（HTML の <meter> と同じ意味）。Slack にはない Cairn 独自の context 要素で、投票の得票率などに使う。
 * min は省略すると 0。label は読み上げ用（バーの横に見せる文字は、同じ context の text 要素で出す）
 */
export const meterElementSchema = z
  .object({
    type: z.literal('meter'),
    value: z.number().finite(),
    min: z.number().finite().optional(),
    max: z.number().finite(),
    label: z.string().min(1).max(BLOCK_LIMITS.meterLabel).optional(),
  })
  .strict()
  .refine((meter) => (meter.min ?? 0) < meter.max, { message: 'max は min より大きくしてください', path: ['max'] })
  .refine((meter) => meter.value >= (meter.min ?? 0) && meter.value <= meter.max, { message: 'value は min 以上 max 以下にしてください', path: ['value'] })

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
      .array(z.union([imageElementSchema, meterElementSchema, plainText(BLOCK_LIMITS.text), mrkdwnText(BLOCK_LIMITS.text)]))
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

/**
 * 標準の Markdown（Slack の markdown ブロックと同じ形）。普段のメッセージと同じ描画部品で描き、Mermaid のコードブロックも図にする。
 * 文字数は1つずつではなく、メッセージ内の合計で数える
 */
export const markdownBlockSchema = z
  .object({
    type: z.literal('markdown'),
    block_id: blockId.optional(),
    text: z.string().min(1).max(BLOCK_LIMITS.markdownTotal),
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
  // モーダルの選択肢の確認ダイアログは描けないので受け付けない（黙って確認を飛ばさない）
  .refine((input) => !(input.element.type === 'static_select' && input.element.confirm), {
    message: 'モーダルの入力欄の static_select には confirm を付けられません',
    path: ['element', 'confirm'],
  })

const MESSAGE_BLOCK_SCHEMAS = {
  section: sectionBlockSchema,
  actions: actionsBlockSchema,
  context: contextBlockSchema,
  image: imageBlockSchema,
  divider: dividerBlockSchema,
  header: headerBlockSchema,
  markdown: markdownBlockSchema,
} as const

// markdown ブロックは Slack と同じくメッセージだけ。モーダルでは受け付けない
const { markdown: _markdown, ...MODAL_NON_INPUT_SCHEMAS } = MESSAGE_BLOCK_SCHEMAS
const MODAL_BLOCK_SCHEMAS = { ...MODAL_NON_INPUT_SCHEMAS, input: inputBlockSchema } as const

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
export type MarkdownBlock = z.infer<typeof markdownBlockSchema>
export type MeterElement = z.infer<typeof meterElementSchema>
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

/** markdown ブロックの文字数は、1つずつではなくメッセージ内の合計で上限をかける（Slack と同じ） */
function refineMarkdownTotal(blocks: Array<{ type: string; text?: unknown }>, ctx: z.RefinementCtx) {
  let total = 0
  blocks.forEach((block, blockIndex) => {
    if (block.type !== 'markdown' || typeof block.text !== 'string') return
    total += block.text.length
    if (total > BLOCK_LIMITS.markdownTotal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [blockIndex, 'text'], message: `markdown ブロックの文字数はメッセージ内の合計で ${BLOCK_LIMITS.markdownTotal} 文字までです` })
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
  .superRefine(refineMarkdownTotal)

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
  const reserved = reservedIdErrors(blocks, Array.isArray(value) ? pointerRoot : `${pointerRoot}/blocks`)
  if (reserved.length > 0) return { ok: false, errors: reserved }
  return { ok: true, value: recheck.data }
}

function reservedIdErrors(blocks: BlockWithElements[], pointer: string): string[] {
  const errors: string[] = []
  blocks.forEach((block, blockIndex) => {
    if (block.block_id !== undefined && !notReservedId(block.block_id)) errors.push(`[ERROR] ${reservedIdMessage} [json-pointer:${pointer}/${blockIndex}/block_id]`)
    interactiveElements(block).forEach(([element, path]) => {
      const id = (element as { action_id?: string }).action_id
      if (id !== undefined && !notReservedId(id)) errors.push(`[ERROR] ${reservedIdMessage} [json-pointer:${pointer}/${blockIndex}/${path.join('/')}/action_id]`)
    })
  })
  return errors
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
