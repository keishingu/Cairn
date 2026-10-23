// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { BLOCK_LIMITS } from '@cairn/shared'
import { Code, ComingSoon, Note, Table, type DocPage, type DocsLocale } from '../_components/doc'

// 上限の数値は受理判定（packages/shared/src/blocks/schema.ts）から引き、ドキュメントとコードをずらさない
const LIMIT_ROWS: Array<{ key: keyof typeof BLOCK_LIMITS; ja: string; en: string }> = [
  { key: 'messageBlocks', ja: '1メッセージのブロック数', en: 'Blocks per message' },
  { key: 'modalBlocks', ja: '1モーダルのブロック数', en: 'Blocks per modal' },
  { key: 'text', ja: 'section の text・context の文字', en: 'section text, context text' },
  { key: 'sectionFields', ja: 'section の fields の数', en: 'section fields' },
  { key: 'sectionFieldText', ja: 'fields 1つの文字数', en: 'Characters per field' },
  { key: 'actionsElements', ja: 'actions の要素数', en: 'Elements in actions' },
  { key: 'contextElements', ja: 'context の要素数', en: 'Elements in context' },
  { key: 'headerText', ja: 'header の文字数', en: 'header text' },
  { key: 'blockId', ja: 'block_id', en: 'block_id' },
  { key: 'actionId', ja: 'action_id', en: 'action_id' },
  { key: 'buttonText', ja: 'ボタンの表示文', en: 'Button text' },
  { key: 'buttonValue', ja: 'ボタンの value', en: 'Button value' },
  { key: 'url', ja: 'URL（ボタン・画像）', en: 'URL (buttons, images)' },
  { key: 'selectOptions', ja: 'static_select の選択肢の数', en: 'static_select options' },
  { key: 'optionText', ja: '選択肢の表示文・説明', en: 'Option text and description' },
  { key: 'optionValue', ja: '選択肢の value', en: 'Option value' },
  { key: 'placeholder', ja: 'placeholder', en: 'placeholder' },
  { key: 'altText', ja: '画像の alt_text', en: 'Image alt_text' },
  { key: 'imageTitle', ja: '画像の title', en: 'Image title' },
  { key: 'confirmTitle', ja: '確認ダイアログの title', en: 'Confirm dialog title' },
  { key: 'confirmText', ja: '確認ダイアログの text', en: 'Confirm dialog text' },
  { key: 'confirmButton', ja: '確認ダイアログのボタン', en: 'Confirm dialog buttons' },
  { key: 'inputLabel', ja: 'input の label', en: 'input label' },
  { key: 'inputHint', ja: 'input の hint', en: 'input hint' },
  { key: 'modalTitle', ja: 'モーダルの title', en: 'Modal title' },
  { key: 'modalButton', ja: 'モーダルの submit / close', en: 'Modal submit / close' },
  { key: 'privateMetadata', ja: 'private_metadata', en: 'private_metadata' },
  { key: 'callbackId', ja: 'callback_id', en: 'callback_id' },
]

// markdown ブロックの合計文字数。受理を有効にするまで BLOCK_LIMITS には無いため、Slack と同じ値をここに書く
const MARKDOWN_TOTAL_LIMIT = 12000

function limitsTable(locale: DocsLocale) {
  return (
    <Table
      head={locale === 'ja' ? ['項目', '上限'] : ['Item', 'Limit']}
      rows={LIMIT_ROWS.map((row) => [row[locale], BLOCK_LIMITS[row.key].toLocaleString('en-US')])}
    />
  )
}

const cardExample = `
[
  { "type": "header", "text": { "type": "plain_text", "text": "Lunch vote" } },
  {
    "type": "section",
    "text": { "type": "mrkdwn", "text": "*Where shall we go?* <@8f0c...-uuid>" },
    "accessory": {
      "type": "button",
      "action_id": "vote",
      "value": "ramen",
      "text": { "type": "plain_text", "text": "Ramen" },
      "style": "primary"
    }
  },
  { "type": "context", "elements": [{ "type": "mrkdwn", "text": "Closes at 12:00" }] }
]
`

const errorExample = `
{
  "ok": false,
  "error": "invalid_blocks",
  "response_metadata": {
    "messages": ["[ERROR] 未対応のブロック種別です: rich_text [json-pointer:/blocks/1/type]"]
  }
}
`

const markdownExample = `
{ "type": "markdown", "text": "## Result\\n\\n| Option | Votes |\\n|---|---|\\n| Ramen | 3 |" }
`

const meterExample = `
{
  "type": "context",
  "elements": [
    { "type": "meter", "value": 3, "max": 5, "label": "Ramen: 3 of 5 votes" },
    { "type": "mrkdwn", "text": "Ramen — 3 votes" }
  ]
}
`

export const blocksPage: DocPage = {
  slug: 'blocks',
  content: {
    ja: {
      title: 'カード（ブロックと要素）',
      description:
        'カードは Slack Block Kit のサブセットです。Cairn は Web とモバイルの両方で描画できるものだけを受け付け、それ以外は投稿の時点でエラーにします。',
      sections: [
        {
          id: 'example',
          title: 'カードの例',
          content: (
            <>
              <p>
                <code>chat.postMessage</code> / <code>chat.update</code> の <code>blocks</code> にブロックの配列を渡します。form-urlencoded
                で送るときは JSON 文字列にします（Bolt の既定）。
              </p>
              <Code>{cardExample}</Code>
            </>
          ),
        },
        {
          id: 'blocks',
          title: '対応するブロック',
          content: (
            <Table
              head={['ブロック', 'メッセージ', 'モーダル', '内容']}
              rows={[
                [<code key="b">section</code>, '○', '○', <>text（mrkdwn / plain_text）、fields、accessory（button / static_select / image）。text か fields のどちらかが必要</>],
                [<code key="b">actions</code>, '○', '○', 'button、static_select'],
                [<code key="b">context</code>, '○', '○', 'text（mrkdwn / plain_text）、image'],
                [<code key="b">image</code>, '○', '○', 'image_url（https のみ）、alt_text（必須）、title'],
                [<code key="b">divider</code>, '○', '○', '—'],
                [<code key="b">header</code>, '○', '○', 'text（plain_text）'],
                [<code key="b">input</code>, '×', '○', 'plain_text_input、static_select。label、hint、optional'],
                [
                  <>
                    <code>markdown</code>
                    <ComingSoon locale="ja" />
                  </>,
                  '○',
                  '×',
                  '標準の Markdown（Slack の markdown ブロックと同じ形）',
                ],
              ]}
            />
          ),
        },
        {
          id: 'elements',
          title: '対応する要素',
          content: (
            <>
              <Table
                head={['要素', 'フィールド']}
                rows={[
                  [
                    <code key="e">button</code>,
                    <>
                      <code>text</code>（plain_text）、<code>action_id</code>、<code>value</code>、<code>url</code>（https のみ）、<code>style</code>（
                      <code>primary</code> / <code>danger</code>）、<code>confirm</code>
                    </>,
                  ],
                  [
                    <code key="e">static_select</code>,
                    <>
                      <code>options</code>、<code>initial_option</code>、<code>placeholder</code>、<code>action_id</code>、<code>confirm</code>
                      （モーダルの input 内では <code>confirm</code> 不可）
                    </>,
                  ],
                  [<code key="e">image</code>, <><code>image_url</code>（https のみ）、<code>alt_text</code></>],
                  [
                    <code key="e">plain_text_input</code>,
                    <>
                      <code>action_id</code>、<code>placeholder</code>、<code>initial_value</code>、<code>multiline</code>、<code>min_length</code>、
                      <code>max_length</code>（input ブロック内のみ）
                    </>,
                  ],
                  [
                    <>
                      <code>meter</code>
                      <ComingSoon locale="ja" />
                    </>,
                    <>
                      <code>value</code>、<code>max</code>、<code>min</code>（省略時 0）、<code>label</code>（読み上げ用）。context ブロックの要素。Cairn 独自
                    </>,
                  ],
                ]}
              />
              <ul>
                <li>
                  <code>confirm</code> は <code>title</code> / <code>text</code> / <code>confirm</code> / <code>deny</code> / <code>style</code>{' '}
                  を持つ確認ダイアログです
                </li>
                <li>
                  <code>static_select</code> の選択肢の <code>value</code> は重複できません。<code>initial_option</code> は <code>options</code>{' '}
                  のどれかと表示文・説明まで一致させます
                </li>
                <li>
                  <code>url</code> 付きのボタンも、Slack と同じく押されたことをアプリへ届けます
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'limits',
          title: '上限',
          content: (
            <>
              <p>上限は Slack に合わせています。超えると投稿・更新が <code>invalid_blocks</code> になります。</p>
              {limitsTable('ja')}
            </>
          ),
        },
        {
          id: 'ids',
          title: 'block_id と action_id',
          content: (
            <ul>
              <li>
                <code>block_id</code> はカード全体で、<code>action_id</code> はブロック内で一意にします。インタラクションの宛先をこの2つで決めます
              </li>
              <li>
                省略すると Cairn が <code>cairn-b0</code> / <code>cairn-a0</code> のような ID を振ります。操作を受け取る要素には自分で ID
                を付けることをおすすめします
              </li>
              <li>
                <code>__proto__</code> や <code>constructor</code> などオブジェクトの組み込みの名前は ID に使えません
              </li>
            </ul>
          ),
        },
        {
          id: 'mrkdwn',
          title: 'mrkdwn の記法',
          content: (
            <>
              <p>
                <code>mrkdwn</code> のテキストは Slack の記法です。Cairn の通常メッセージの Markdown とは別物として解釈します。
              </p>
              <Table
                head={['記法', '表示']}
                rows={[
                  [<code key="m">*太字*</code>, '太字'],
                  [<code key="m">_斜体_</code>, '斜体'],
                  [<code key="m">~取り消し~</code>, '取り消し線'],
                  [<code key="m">`code`</code>, 'インラインコード'],
                  [<code key="m">```複数行```</code>, 'コードブロック'],
                  [<code key="m">&gt; 引用</code>, '行頭で引用'],
                  [<code key="m">&lt;https://example.com|表示&gt;</code>, 'リンク（本文中の https の URL も自動でリンク。verbatim: true で無効）'],
                  [<code key="m">&lt;@ユーザーの UUID&gt;</code>, 'メンション'],
                  [<code key="m">&lt;!here&gt; &lt;!channel&gt; &lt;!everyone&gt;</code>, '全体への呼びかけの表示'],
                ]}
              />
              <p>
                書式記号の前後が英数字のときは書式にしません（<code>snake_case</code> や <code>2*3*4</code> を崩さないため）。日本語の{' '}
                <code>これは*太字*です</code> は太字になります。文字参照は <code>&amp;amp;</code> <code>&amp;lt;</code> <code>&amp;gt;</code>{' '}
                の3つだけを戻します。
              </p>
            </>
          ),
        },
        {
          id: 'errors',
          title: '受け付けないブロックとエラー',
          content: (
            <>
              <p>
                未知のブロック・要素・フィールドはすべて拒否します。理由は Slack と同じく <code>[ERROR] 理由 [json-pointer:...]</code>{' '}
                の形で返します（理由の文は現在日本語です）。
              </p>
              <Code>{errorExample}</Code>
              <ul>
                <li>URL は https だけを受け付けます（http は Web では混在コンテンツ、iOS では表示できないため）</li>
                <li>カードの表示文も、通常の投稿と同じ安全フィルタにかけます</li>
                <li>
                  古いバージョンのモバイルアプリが知らない要素に出会うと、その位置に「アプリを更新してください」と表示し、カード全体が描けない場合は
                  <code>text</code>（代替テキスト）を表示します
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'coming-soon',
          title: '近日対応: markdown ブロックと meter 要素',
          content: (
            <>
              <Note>
                描画は準備済みで、モバイルアプリの更新が行き渡った後に受け付けを始めます。それまでは <code>invalid_blocks</code>{' '}
                になります。開始時はこのページの印を外してお知らせします。
              </Note>
              <h3>markdown ブロック</h3>
              <p>
                Slack の <code>markdown</code> ブロックと同じ形で、見出し・表・リストなど標準の Markdown を書けます。Cairn の通常メッセージと同じ部品で描くので、
                Mermaid のコードブロックは図になります。メッセージだけで使え、モーダルでは使えません。文字数はメッセージ内の markdown
                ブロックの合計で {MARKDOWN_TOTAL_LIMIT.toLocaleString('en-US')} 文字までです。
              </p>
              <Code>{markdownExample}</Code>
              <h3>meter 要素（Cairn 独自）</h3>
              <p>
                量を表すバーです（HTML の <code>&lt;meter&gt;</code> と同じ意味）。context ブロックの要素として置き、投票の得票率などに使います。
                <code>min</code> は省略すると 0 で、<code>min &lt; max</code>、<code>min ≤ value ≤ max</code> にします。<code>label</code>{' '}
                は読み上げ用で、バーの横に見せる文字は同じ context の text 要素で出します。Slack にはない要素なので、Slack と共通のコードで使うときは送り分けてください。
              </p>
              <Code>{meterExample}</Code>
            </>
          ),
        },
        {
          id: 'next',
          title: '次に読む',
          content: (
            <p>
              カードの投稿・更新は <Link href="/developers/web-api">Bot Web API</Link>、ボタンや選択の受け取りは{' '}
              <Link href="/developers/interactions">インタラクション</Link>を参照してください。
            </p>
          ),
        },
      ],
    },
    en: {
      title: 'Cards (blocks and elements)',
      description:
        'Cards are a subset of Slack Block Kit. Cairn accepts only what both the web and mobile apps can render, and rejects everything else when you post.',
      sections: [
        {
          id: 'example',
          title: 'Example card',
          content: (
            <>
              <p>
                Pass an array of blocks as <code>blocks</code> to <code>chat.postMessage</code> / <code>chat.update</code>. When sending
                form-urlencoded, encode it as a JSON string (Bolt’s default).
              </p>
              <Code>{cardExample}</Code>
            </>
          ),
        },
        {
          id: 'blocks',
          title: 'Supported blocks',
          content: (
            <Table
              head={['Block', 'Messages', 'Modals', 'Contents']}
              rows={[
                [<code key="b">section</code>, '✓', '✓', 'text (mrkdwn / plain_text), fields, accessory (button / static_select / image). Needs text or fields'],
                [<code key="b">actions</code>, '✓', '✓', 'button, static_select'],
                [<code key="b">context</code>, '✓', '✓', 'text (mrkdwn / plain_text), image'],
                [<code key="b">image</code>, '✓', '✓', 'image_url (https only), alt_text (required), title'],
                [<code key="b">divider</code>, '✓', '✓', '—'],
                [<code key="b">header</code>, '✓', '✓', 'text (plain_text)'],
                [<code key="b">input</code>, '—', '✓', 'plain_text_input, static_select; label, hint, optional'],
                [
                  <>
                    <code>markdown</code>
                    <ComingSoon locale="en" />
                  </>,
                  '✓',
                  '—',
                  'Standard Markdown (same shape as Slack’s markdown block)',
                ],
              ]}
            />
          ),
        },
        {
          id: 'elements',
          title: 'Supported elements',
          content: (
            <>
              <Table
                head={['Element', 'Fields']}
                rows={[
                  [
                    <code key="e">button</code>,
                    <>
                      <code>text</code> (plain_text), <code>action_id</code>, <code>value</code>, <code>url</code> (https only), <code>style</code> (
                      <code>primary</code> / <code>danger</code>), <code>confirm</code>
                    </>,
                  ],
                  [
                    <code key="e">static_select</code>,
                    <>
                      <code>options</code>, <code>initial_option</code>, <code>placeholder</code>, <code>action_id</code>, <code>confirm</code> (not
                      allowed inside a modal input)
                    </>,
                  ],
                  [<code key="e">image</code>, <><code>image_url</code> (https only), <code>alt_text</code></>],
                  [
                    <code key="e">plain_text_input</code>,
                    <>
                      <code>action_id</code>, <code>placeholder</code>, <code>initial_value</code>, <code>multiline</code>, <code>min_length</code>,{' '}
                      <code>max_length</code> (input blocks only)
                    </>,
                  ],
                  [
                    <>
                      <code>meter</code>
                      <ComingSoon locale="en" />
                    </>,
                    <>
                      <code>value</code>, <code>max</code>, <code>min</code> (defaults to 0), <code>label</code> (for screen readers). An element of
                      context blocks. Cairn-specific
                    </>,
                  ],
                ]}
              />
              <ul>
                <li>
                  <code>confirm</code> is a confirmation dialog with <code>title</code> / <code>text</code> / <code>confirm</code> / <code>deny</code>{' '}
                  / <code>style</code>
                </li>
                <li>
                  Option <code>value</code>s in a <code>static_select</code> must be unique. <code>initial_option</code> must match one of the{' '}
                  <code>options</code> exactly, including its text and description
                </li>
                <li>
                  Buttons with a <code>url</code> also notify your app when pressed, as in Slack
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'limits',
          title: 'Limits',
          content: (
            <>
              <p>
                Limits follow Slack. Exceeding one makes the post or update fail with <code>invalid_blocks</code>.
              </p>
              {limitsTable('en')}
            </>
          ),
        },
        {
          id: 'ids',
          title: 'block_id and action_id',
          content: (
            <ul>
              <li>
                <code>block_id</code> must be unique within the card and <code>action_id</code> unique within its block. Together they identify the
                target of an interaction
              </li>
              <li>
                If omitted, Cairn assigns IDs such as <code>cairn-b0</code> / <code>cairn-a0</code>. We recommend setting your own IDs on elements you
                handle
              </li>
              <li>
                Built-in object property names such as <code>__proto__</code> and <code>constructor</code> cannot be used as IDs
              </li>
            </ul>
          ),
        },
        {
          id: 'mrkdwn',
          title: 'mrkdwn syntax',
          content: (
            <>
              <p>
                <code>mrkdwn</code> text uses Slack’s syntax and is interpreted separately from the Markdown of regular Cairn messages.
              </p>
              <Table
                head={['Syntax', 'Result']}
                rows={[
                  [<code key="m">*bold*</code>, 'Bold'],
                  [<code key="m">_italic_</code>, 'Italic'],
                  [<code key="m">~strike~</code>, 'Strikethrough'],
                  [<code key="m">`code`</code>, 'Inline code'],
                  [<code key="m">```multi-line```</code>, 'Code block'],
                  [<code key="m">&gt; quote</code>, 'Quote at the start of a line'],
                  [<code key="m">&lt;https://example.com|label&gt;</code>, 'Link (bare https URLs are linked too; disable with verbatim: true)'],
                  [<code key="m">&lt;@user UUID&gt;</code>, 'Mention'],
                  [<code key="m">&lt;!here&gt; &lt;!channel&gt; &lt;!everyone&gt;</code>, 'Broadcast label'],
                ]}
              />
              <p>
                Markers next to ASCII letters or digits are not treated as formatting, so <code>snake_case</code> and <code>2*3*4</code> stay intact,
                while Japanese text like <code>これは*太字*です</code> is bolded. Only the <code>&amp;amp;</code> <code>&amp;lt;</code>{' '}
                <code>&amp;gt;</code> entities are decoded.
              </p>
            </>
          ),
        },
        {
          id: 'errors',
          title: 'Rejected blocks and errors',
          content: (
            <>
              <p>
                Unknown blocks, elements and fields are all rejected. As in Slack, reasons come back as <code>[ERROR] reason [json-pointer:...]</code>{' '}
                (reason texts are currently in Japanese).
              </p>
              <Code>{errorExample}</Code>
              <ul>
                <li>Only https URLs are accepted (http is mixed content on the web and cannot be shown on iOS)</li>
                <li>Visible card text goes through the same safety filter as regular messages</li>
                <li>
                  When an older mobile app meets an element it does not know, it shows “update the app” in its place, and falls back to the message{' '}
                  <code>text</code> if the whole card cannot be drawn
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'coming-soon',
          title: 'Coming soon: markdown block and meter element',
          content: (
            <>
              <Note>
                Rendering is ready; Cairn will start accepting these once the mobile app update has rolled out. Until then they fail with{' '}
                <code>invalid_blocks</code>. We will remove the badge on this page when they are accepted.
              </Note>
              <h3>markdown block</h3>
              <p>
                Same shape as Slack’s <code>markdown</code> block: write standard Markdown with headings, tables and lists. It is drawn with the same
                components as regular Cairn messages, so Mermaid code blocks become diagrams. Messages only, not modals. The total length of all
                markdown blocks in a message is limited to {MARKDOWN_TOTAL_LIMIT.toLocaleString('en-US')} characters.
              </p>
              <Code>{markdownExample}</Code>
              <h3>meter element (Cairn-specific)</h3>
              <p>
                A bar showing a quantity (same meaning as HTML’s <code>&lt;meter&gt;</code>), placed as a context element — for example a poll’s share of
                votes. <code>min</code> defaults to 0; require <code>min &lt; max</code> and <code>min ≤ value ≤ max</code>. <code>label</code> is for
                screen readers; show visible text next to the bar with a text element in the same context. Slack has no such element, so branch your
                output if the same code also targets Slack.
              </p>
              <Code>{meterExample}</Code>
            </>
          ),
        },
        {
          id: 'next',
          title: 'Next',
          content: (
            <p>
              Post and update cards with the <Link href="/developers/en/web-api">Bot Web API</Link>; receive presses and selections via{' '}
              <Link href="/developers/en/interactions">Interactions</Link>.
            </p>
          ),
        },
      ],
    },
  },
}
