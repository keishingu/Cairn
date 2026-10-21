// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Web とネイティブ双方の描画テストが読む代表的なカード。サブセットに要素を足すときはここにも足し、
// 「全 fixture を例外なく描ける」「未対応要素は案内になる」を両方のテストで確かめる（docs/app-platform-design.md §4.3）。
// `@cairn/shared/blocks/fixtures` から読む（本体の bundle に含めないため index からは export しない）。

const MENTION_USER_ID = '00000000-0000-4000-8000-000000000001'

/** 登山本部の担当決め（投票アプリのカード） */
export const pollCardFixture = [
  { type: 'header', block_id: 'title', text: { type: 'plain_text', text: '11月の登山本部 担当決め' } },
  {
    type: 'section',
    block_id: 'body',
    text: {
      type: 'mrkdwn',
      text: `下山連絡の電話当番です。*担当できる週*に投票してください。 <@${MENTION_USER_ID}>`,
    },
  },
  {
    type: 'section',
    block_id: 'option-1',
    text: { type: 'mrkdwn', text: '*第1週 (11/2〜)*\n`▓▓▓░░` 2票' },
    accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' }, value: 'option:1' },
  },
  {
    type: 'context',
    block_id: 'voters-1',
    elements: [{ type: 'mrkdwn', text: `<@${MENTION_USER_ID}> ほか1人` }],
  },
  {
    type: 'section',
    block_id: 'option-2',
    text: { type: 'mrkdwn', text: '*第2週 (11/9〜)*\n`░░░░░` 0票' },
    accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' }, value: 'option:2' },
  },
  { type: 'context', block_id: 'meta', elements: [{ type: 'plain_text', text: '単一選択 ・ 締切 11/20 23:59' }] },
  {
    type: 'actions',
    block_id: 'controls',
    elements: [
      { type: 'button', action_id: 'clear-vote', text: { type: 'plain_text', text: '自分の票を取り消す' } },
      {
        type: 'button',
        action_id: 'close',
        style: 'danger',
        text: { type: 'plain_text', text: '締め切る' },
        confirm: {
          title: { type: 'plain_text', text: '投票を締め切りますか？' },
          text: { type: 'plain_text', text: '締め切ると、誰も投票できなくなります。' },
          confirm: { type: 'plain_text', text: '締め切る' },
          deny: { type: 'plain_text', text: 'やめる' },
          style: 'danger',
        },
      },
    ],
  },
] as const

/** サブセットのブロック・要素をすべて1回ずつ含む */
export const allElementsFixture = [
  { type: 'header', text: { type: 'plain_text', text: '見出し' } },
  {
    type: 'section',
    text: { type: 'plain_text', text: 'プレーンテキスト', emoji: true },
    fields: [
      { type: 'mrkdwn', text: '*日程*\n11/2〜11/3' },
      { type: 'plain_text', text: '場所: 北岳' },
    ],
    accessory: { type: 'image', image_url: 'https://example.com/mountain.png', alt_text: '北岳の写真' },
  },
  {
    type: 'section',
    text: { type: 'mrkdwn', text: '_斜体_ ~取り消し~ <https://example.com|リンク> <!here>\n> 引用' },
    accessory: {
      type: 'static_select',
      action_id: 'pick',
      placeholder: { type: 'plain_text', text: '選んでください' },
      options: [
        { text: { type: 'plain_text', text: '参加' }, value: 'yes' },
        { text: { type: 'plain_text', text: '不参加' }, value: 'no', description: { type: 'plain_text', text: '理由は任意' } },
      ],
      initial_option: { text: { type: 'plain_text', text: '参加' }, value: 'yes' },
    },
  },
  { type: 'divider' },
  { type: 'image', image_url: 'https://example.com/route.png', alt_text: 'ルート図', title: { type: 'plain_text', text: 'ルート' } },
  {
    type: 'context',
    elements: [
      { type: 'image', image_url: 'https://example.com/icon.png', alt_text: 'アイコン' },
      { type: 'mrkdwn', text: '```コード\nブロック```' },
    ],
  },
  {
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: '主ボタン' }, style: 'primary', action_id: 'primary', value: 'p' },
      { type: 'button', text: { type: 'plain_text', text: '外部リンク' }, action_id: 'open', url: 'https://example.com/docs' },
      {
        type: 'static_select',
        action_id: 'select',
        options: [{ text: { type: 'plain_text', text: 'A' }, value: 'a' }],
      },
    ],
  },
] as const

/**
 * このバージョンのクライアントが知らないブロック・要素を含む（新しい版のサーバーが受理した想定）。
 * 描画側は rich_text と overflow の位置に案内を出し、残りは普通に描く
 */
export const unsupportedFixture = [
  { type: 'section', text: { type: 'plain_text', text: '描ける本文' }, accessory: { type: 'overflow', action_id: 'more', options: [] } },
  { type: 'rich_text', elements: [] },
  {
    type: 'actions',
    elements: [
      { type: 'button', action_id: 'ok', text: { type: 'plain_text', text: '描けるボタン' } },
      { type: 'datepicker', action_id: 'date' },
    ],
  },
] as const

/** 何も描けない。描画側は代替テキストと案内を出す */
export const nothingRenderableFixture = [{ type: 'rich_text', elements: [] }, { type: 'video' }] as const

/** 投票作成のモーダル */
export const pollModalFixture = {
  type: 'modal',
  callback_id: 'create-poll',
  title: { type: 'plain_text', text: '投票を作成' },
  submit: { type: 'plain_text', text: '作成' },
  close: { type: 'plain_text', text: 'キャンセル' },
  private_metadata: '{"channelId":"c1"}',
  blocks: [
    {
      type: 'input',
      block_id: 'question',
      label: { type: 'plain_text', text: '質問' },
      element: { type: 'plain_text_input', action_id: 'value', max_length: 200 },
    },
    {
      type: 'input',
      block_id: 'options',
      label: { type: 'plain_text', text: '選択肢（1行に1つ）' },
      element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      hint: { type: 'plain_text', text: '2〜10個' },
    },
    {
      type: 'input',
      block_id: 'mode',
      optional: true,
      label: { type: 'plain_text', text: '選び方' },
      element: {
        type: 'static_select',
        action_id: 'value',
        options: [
          { text: { type: 'plain_text', text: '1つだけ' }, value: 'single' },
          { text: { type: 'plain_text', text: '複数' }, value: 'multiple' },
        ],
      },
    },
  ],
} as const

export const MESSAGE_BLOCK_FIXTURES = {
  pollCard: pollCardFixture,
  allElements: allElementsFixture,
  unsupported: unsupportedFixture,
  nothingRenderable: nothingRenderableFixture,
} as const
