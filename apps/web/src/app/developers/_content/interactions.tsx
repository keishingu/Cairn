// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { Code, Note, Table, type DocPage } from '../_components/doc'

const verifyExample = `
import { createHmac, timingSafeEqual } from 'node:crypto'

// rawBody は受け取ったままの本文（パース前の文字列）
function verify(signingSecret, headers, rawBody) {
  const timestamp = headers['x-slack-request-timestamp']
  const signature = headers['x-slack-signature']
  if (!timestamp || !signature) return false
  // 5分より古い要求はリプレイとして拒否する
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false
  const expected = 'v0=' + createHmac('sha256', signingSecret).update(\`v0:\${timestamp}:\${rawBody}\`).digest('hex')
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
`

const verifyExampleEn = verifyExample
  .replace('// rawBody は受け取ったままの本文（パース前の文字列）', '// rawBody is the body exactly as received (before parsing)')
  .replace('// 5分より古い要求はリプレイとして拒否する', '// Reject requests older than 5 minutes as replays')

const blockActionsExample = `
{
  "type": "block_actions",
  "team": { "id": "<workspace UUID>", "domain": "<workspace slug>" },
  "user": { "id": "<user UUID>", "name": "<display name>", "team_id": "<workspace UUID>" },
  "api_app_id": "<app UUID>",
  "token": "",
  "trigger_id": "<one-time ID>",
  "container": { "type": "message", "message_ts": "<message UUID>", "channel_id": "<channel UUID>", "is_ephemeral": false },
  "channel": { "id": "<channel UUID>", "name": "<channel name>" },
  "message": {
    "type": "message",
    "ts": "<message UUID>",
    "text": "<fallback text>",
    "user": "<bot user UUID>",
    "bot_id": "<installation UUID>",
    "blocks": [ ... ]
  },
  "actions": [
    {
      "type": "button",
      "block_id": "poll",
      "action_id": "vote",
      "text": { "type": "plain_text", "text": "Ramen" },
      "value": "ramen",
      "action_ts": "1761200000.123000"
    }
  ],
  "cairn": { "message_id": "<message UUID>", "interaction_id": "<UUID>", "locale": "ja" }
}
`

const selectActionExample = `
{
  "type": "static_select",
  "block_id": "pick",
  "action_id": "place",
  "selected_option": { "text": { "type": "plain_text", "text": "Ramen" }, "value": "ramen" },
  "action_ts": "1761200000.123000"
}
`

const commandExample = `
token=&team_id=<workspace UUID>&team_domain=<slug>&channel_id=<channel UUID>&channel_name=<name>
&user_id=<user UUID>&user_name=<display name>&command=/poll&text=&api_app_id=<app UUID>
&is_enterprise_install=false&trigger_id=<one-time ID>&locale=ja
`

export const interactionsPage: DocPage = {
  slug: 'interactions',
  content: {
    ja: {
      title: 'インタラクション',
      description:
        '利用者がカードのボタンや選択を操作したり、モーダルを送信したり、メニューからアプリを起動したりすると、Cairn はその内容を署名付きでアプリの Request URL へ POST します。形式は Slack の Interactivity と同じです。',
      sections: [
        {
          id: 'delivery',
          title: '配送',
          content: (
            <>
              <ul>
                <li>
                  <code>POST</code>、<code>Content-Type: application/x-www-form-urlencoded</code> で、本文は <code>payload=&lt;JSON&gt;</code>{' '}
                  です（メニューからの起動だけはフィールドを並べた form。後述）
                </li>
                <li>
                  <strong>3秒以内に 2xx を返してください</strong>。この3秒には Request URL の名前解決も含みます。Cairn は自動で再送しません
                </li>
                <li>
                  期限切れ・2xx 以外・接続できない場合は、操作した本人にだけ「アプリが応答しませんでした」と表示し、カードは変えません
                </li>
                <li>リダイレクトはたどりません。応答本文は 256KB まで読みます</li>
                <li>
                  ボタンや選択への応答本文は使いません。カードを変えるときは <code>chat.update</code> を呼びます（<code>response_url</code>{' '}
                  は未対応です）
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'request-url',
          title: 'Request URL',
          content: (
            <ul>
              <li>https だけを受け付けます。URL に認証情報（<code>user:pass@</code>）は含められません</li>
              <li>
                名前解決の結果に、プライベート・ループバック・リンクローカルなど公開でないアドレスが1つでも含まれると送りません。登録時と送信時の両方で確かめます
              </li>
            </ul>
          ),
        },
        {
          id: 'signature',
          title: '署名の検証',
          content: (
            <>
              <p>Slack と同じ v0 署名です。ヘッダー名も Slack のままなので、Bolt の検証がそのまま通ります。</p>
              <Table
                head={['ヘッダー', '値']}
                rows={[
                  [<code key="h">X-Slack-Request-Timestamp</code>, '送信時の UNIX 時刻（秒）'],
                  [
                    <code key="h">X-Slack-Signature</code>,
                    <>
                      <code>v0=</code> + <code>HMAC-SHA256(署名シークレット, &quot;v0:&quot; + timestamp + &quot;:&quot; + 本文)</code> の16進数
                    </>,
                  ],
                ]}
              />
              <p>本文はパースする前の文字列で計算し、比較は定数時間で行い、5分より古いタイムスタンプは拒否してください。</p>
              <Code>{verifyExample}</Code>
            </>
          ),
        },
        {
          id: 'block-actions',
          title: 'block_actions（ボタン・選択）',
          content: (
            <>
              <Code>{blockActionsExample}</Code>
              <p>
                <code>static_select</code> の場合、<code>actions</code> の要素は次の形です。
              </p>
              <Code>{selectActionExample}</Code>
              <ul>
                <li>
                  ボタンの <code>value</code> や選択肢は、利用者の端末から送られた値ではなく、Cairn が保存しているカードから引いて届けます。改ざんされた値は届きません
                </li>
                <li>
                  <code>token</code> は常に空です（非推奨の verification token は使いません。署名で検証してください）
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'cairn-fields',
          title: 'cairn.* の追加フィールド',
          content: (
            <>
              <p>
                ペイロードの <code>cairn</code> オブジェクトは Cairn 独自の拡張です。Slack 向けのアプリは無視して構いません。
              </p>
              <Table
                head={['フィールド', '内容']}
                rows={[
                  [<code key="f">cairn.message_id</code>, 'カードのメッセージの UUID（block_actions）'],
                  [<code key="f">cairn.channel_id</code>, 'モーダルを開いたチャンネルの UUID（view_submission）'],
                  [<code key="f">cairn.interaction_id</code>, '操作ごとの UUID。重複の除去に使う（下記）'],
                  [
                    <code key="f">cairn.locale</code>,
                    <>
                      操作した人の表示言語（<code>ja</code> / <code>en</code> / <code>ko</code>）。モーダル・入力エラー・案内をこの言語で返すために使う
                    </>,
                  ],
                ]}
              />
              <p>
                <code>cairn.locale</code> は利用者の端末が実際に表示している言語です。端末から届かないときは Accept-Language から決めます。
              </p>
            </>
          ),
        },
        {
          id: 'idempotency',
          title: '重複と冪等性',
          content: (
            <>
              <p>
                アプリが処理した後で応答だけが失われると、Cairn からは失敗に見え、利用者がもう一度操作することがあります。次のように作ってください。
              </p>
              <ul>
                <li>
                  処理済みの <code>cairn.interaction_id</code> を記録し、同じ ID を二度処理しない
                </li>
                <li>
                  ボタンの意味を冪等にする（「この選択肢に投票する」は何度押しても同じ結果になる。押すたびに切り替わるトグルにしない。取り消しは別のボタンにする）
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'trigger-id',
          title: 'trigger_id',
          content: (
            <ul>
              <li>
                <code>views.open</code> でモーダルを開くための一時 ID です。操作した本人とインストールに結びつき、1回だけ使えます
              </li>
              <li>
                有効期限は発行から6秒です（配送の3秒に、応答した後で <code>views.open</code> を呼ぶ3秒を足したもの）。ack を返してからすぐに開いてください
              </li>
            </ul>
          ),
        },
        {
          id: 'commands',
          title: 'メニューからの起動',
          content: (
            <>
              <p>
                利用者がメッセージ入力欄のアプリのメニューからアプリを選ぶと、Slack のスラッシュコマンドと同じ形の form を送ります（本文は{' '}
                <code>payload=</code> ではなく、フィールドを並べた form です）。
              </p>
              <Code>{commandExample}</Code>
              <ul>
                <li>
                  <code>text</code> は常に空です。コマンドを入力欄に打って起動する機能はまだありません
                </li>
                <li>
                  <code>response_url</code> は送りません。応答は <code>views.open</code>（<code>trigger_id</code> を使う）と{' '}
                  <code>chat.postMessage</code> で行います
                </li>
                <li>
                  <code>locale</code> は Slack にはない Cairn の追加フィールドで、<code>cairn.locale</code> と同じ意味です
                </li>
              </ul>
              <Note>
                モーダルの送信（<code>view_submission</code>）は <Link href="/developers/modals">モーダル</Link>を参照してください。
              </Note>
            </>
          ),
        },
      ],
    },
    en: {
      title: 'Interactions',
      description:
        'When a member presses a button or picks an option on a card, submits a modal, or launches your app from a menu, Cairn POSTs it, signed, to your app’s Request URL. The format is the same as Slack Interactivity.',
      sections: [
        {
          id: 'delivery',
          title: 'Delivery',
          content: (
            <ul>
              <li>
                <code>POST</code> with <code>Content-Type: application/x-www-form-urlencoded</code> and a <code>payload=&lt;JSON&gt;</code> body
                (menu launches are the exception: a flat form, see below)
              </li>
              <li>
                <strong>Return a 2xx within 3 seconds.</strong> The 3 seconds include resolving the Request URL. Cairn does not retry
              </li>
              <li>
                On a timeout, a non-2xx status or a connection failure, only the member who acted sees “The app didn’t respond”; the card is unchanged
              </li>
              <li>Redirects are not followed. Up to 256 KB of the response body is read</li>
              <li>
                The response body to a button or select is not used. To change the card, call <code>chat.update</code> (<code>response_url</code> is
                not supported yet)
              </li>
            </ul>
          ),
        },
        {
          id: 'request-url',
          title: 'Request URL',
          content: (
            <ul>
              <li>
                Only https is accepted. Credentials in the URL (<code>user:pass@</code>) are not allowed
              </li>
              <li>
                If the host resolves to any non-public address (private, loopback, link-local, …), nothing is sent. This is checked both when the URL is
                registered and when sending
              </li>
            </ul>
          ),
        },
        {
          id: 'signature',
          title: 'Verifying signatures',
          content: (
            <>
              <p>Requests use Slack’s v0 signature with the same header names, so Bolt verifies them unchanged.</p>
              <Table
                head={['Header', 'Value']}
                rows={[
                  [<code key="h">X-Slack-Request-Timestamp</code>, 'UNIX time (seconds) when sent'],
                  [
                    <code key="h">X-Slack-Signature</code>,
                    <>
                      <code>v0=</code> + hex of <code>HMAC-SHA256(signing secret, &quot;v0:&quot; + timestamp + &quot;:&quot; + body)</code>
                    </>,
                  ],
                ]}
              />
              <p>Compute it over the raw body before parsing, compare in constant time, and reject timestamps older than 5 minutes.</p>
              <Code>{verifyExampleEn}</Code>
            </>
          ),
        },
        {
          id: 'block-actions',
          title: 'block_actions (buttons and selects)',
          content: (
            <>
              <Code>{blockActionsExample}</Code>
              <p>
                For a <code>static_select</code>, the entry in <code>actions</code> looks like this:
              </p>
              <Code>{selectActionExample}</Code>
              <ul>
                <li>
                  Button <code>value</code>s and options are taken from the card Cairn has stored, not from the member’s device, so tampered values never
                  reach your app
                </li>
                <li>
                  <code>token</code> is always empty (the deprecated verification token is not used; verify the signature instead)
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'cairn-fields',
          title: 'cairn.* fields',
          content: (
            <>
              <p>
                The <code>cairn</code> object in payloads is a Cairn extension. Apps written for Slack can ignore it.
              </p>
              <Table
                head={['Field', 'Contents']}
                rows={[
                  [<code key="f">cairn.message_id</code>, 'UUID of the card’s message (block_actions)'],
                  [<code key="f">cairn.channel_id</code>, 'UUID of the channel the modal was opened from (view_submission)'],
                  [<code key="f">cairn.interaction_id</code>, 'A UUID per action, for de-duplication (below)'],
                  [
                    <code key="f">cairn.locale</code>,
                    <>
                      The member’s display language (<code>ja</code> / <code>en</code> / <code>ko</code>). Use it to answer with modals, input errors and
                      messages in that language
                    </>,
                  ],
                ]}
              />
              <p>
                <code>cairn.locale</code> is the language the member’s device is actually showing. If the device does not send one, it is taken from
                Accept-Language.
              </p>
            </>
          ),
        },
        {
          id: 'idempotency',
          title: 'Duplicates and idempotency',
          content: (
            <>
              <p>
                If your app processes an action but its response is lost, Cairn sees a failure and the member may try again. Build for that:
              </p>
              <ul>
                <li>
                  Record processed <code>cairn.interaction_id</code>s and never process the same ID twice
                </li>
                <li>
                  Make buttons idempotent (“vote for this option” gives the same result however often it is pressed; avoid toggles, and use a separate
                  button to undo)
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'trigger-id',
          title: 'trigger_id',
          content: (
            <ul>
              <li>
                A one-time ID for opening a modal with <code>views.open</code>, bound to the member who acted and to your installation
              </li>
              <li>
                It expires 6 seconds after it is issued (3 seconds for delivery plus 3 seconds to call <code>views.open</code> after you respond). Open
                the modal right after you ack
              </li>
            </ul>
          ),
        },
        {
          id: 'commands',
          title: 'Launching from the menu',
          content: (
            <>
              <p>
                When a member picks your app from the app menu next to the message composer, Cairn sends a form shaped like a Slack slash command (a flat
                form, not <code>payload=</code>).
              </p>
              <Code>{commandExample}</Code>
              <ul>
                <li>
                  <code>text</code> is always empty; typing commands into the composer is not available yet
                </li>
                <li>
                  No <code>response_url</code> is sent. Respond with <code>views.open</code> (using the <code>trigger_id</code>) and{' '}
                  <code>chat.postMessage</code>
                </li>
                <li>
                  <code>locale</code> is a Cairn addition not present in Slack, with the same meaning as <code>cairn.locale</code>
                </li>
              </ul>
              <Note>
                For modal submissions (<code>view_submission</code>), see <Link href="/developers/en/modals">Modals</Link>.
              </Note>
            </>
          ),
        },
      ],
    },
  },
}
