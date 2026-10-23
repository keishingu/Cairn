// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Code, Note, Table, type DocPage, type DocsLocale } from '../_components/doc'

const curlExample = `
curl -X POST https://oss-cairn.com/api/app-api/chat.postMessage \\
  -H "Authorization: Bearer $CAIRN_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channel": "3b1f...-channel-uuid",
    "text": "Lunch vote",
    "blocks": [{ "type": "section", "text": { "type": "mrkdwn", "text": "*Where shall we go?*" } }]
  }'
`

const postResponse = `
{
  "ok": true,
  "channel": "3b1f...-channel-uuid",
  "ts": "9c2e...-message-uuid",
  "message": {
    "type": "message",
    "text": "Lunch vote",
    "user": "<bot user UUID>",
    "bot_id": "<installation UUID>",
    "app_id": "<app UUID>",
    "ts": "9c2e...-message-uuid",
    "blocks": [ ... ]
  },
  "cairn": { "message_id": "9c2e...-message-uuid" }
}
`

type MethodRow = { method: string; scope: string; args: string; ja: ReactNode; en: ReactNode }

const METHODS: MethodRow[] = [
  {
    method: 'auth.test',
    scope: '—',
    args: '—',
    ja: (
      <>
        トークンの確認（Bolt が起動時に呼ぶ）。<code>team_id</code> / <code>user_id</code>（Bot）/ <code>bot_id</code> / <code>app_id</code>{' '}
        などを返す
      </>
    ),
    en: (
      <>
        Verifies the token (Bolt calls it on start). Returns <code>team_id</code>, <code>user_id</code> (the bot), <code>bot_id</code>,{' '}
        <code>app_id</code> and more
      </>
    ),
  },
  {
    method: 'chat.postMessage',
    scope: 'chat:write',
    args: 'channel, text, blocks, client_msg_id',
    ja: 'Bot が参加しているチャンネルへ投稿する',
    en: 'Posts to a channel the bot is in',
  },
  {
    method: 'chat.update',
    scope: 'chat:write',
    args: 'channel, ts, text, blocks',
    ja: '同じインストールの Bot が投稿したメッセージを更新する',
    en: 'Updates a message posted by the same installation’s bot',
  },
  {
    method: 'chat.delete',
    scope: 'chat:write',
    args: 'channel, ts',
    ja: '同じインストールの Bot が投稿したメッセージを削除する',
    en: 'Deletes a message posted by the same installation’s bot',
  },
  {
    method: 'users.info',
    scope: 'users:read',
    args: 'user',
    ja: 'ワークスペースの有効なメンバーの ID・表示名・アイコン',
    en: 'ID, display name and avatar of an active workspace member',
  },
  {
    method: 'conversations.members',
    scope: 'channels:read',
    args: 'channel',
    ja: (
      <>
        Bot が参加しているチャンネルの有効なメンバーの ID。ページ分割はなく、<code>next_cursor</code> は常に空
      </>
    ),
    en: (
      <>
        IDs of active members of a channel the bot is in. Not paginated; <code>next_cursor</code> is always empty
      </>
    ),
  },
  {
    method: 'views.open',
    scope: '—',
    args: 'trigger_id, view',
    ja: <>モーダルを開く（<Link href="/developers/modals">モーダル</Link>）</>,
    en: <>Opens a modal (see <Link href="/developers/en/modals">Modals</Link>)</>,
  },
  {
    method: 'views.update',
    scope: '—',
    args: 'view_id, view, hash',
    ja: '開いているモーダルを差し替える',
    en: 'Replaces an open modal',
  },
]

function methodsTable(locale: DocsLocale) {
  return (
    <Table
      head={locale === 'ja' ? ['メソッド', 'スコープ', '引数', '内容'] : ['Method', 'Scope', 'Arguments', 'Description']}
      rows={METHODS.map((row) => [
        <code key="m">{row.method}</code>,
        row.scope === '—' ? '—' : <code key="s">{row.scope}</code>,
        row.args === '—' ? '—' : <code key="a">{row.args}</code>,
        row[locale],
      ])}
    />
  )
}

type ErrorRow = { code: string; methods: string; ja: string; en: string }

const ERRORS: ErrorRow[] = [
  { code: 'not_authed', methods: '*', ja: 'トークンがない', en: 'No token was sent' },
  { code: 'invalid_auth', methods: '*', ja: 'トークンが正しくない', en: 'The token is not valid' },
  { code: 'token_revoked', methods: '*', ja: 'トークンが取り消された、またはアプリがアンインストールされた', en: 'The token was revoked or the app was uninstalled' },
  { code: 'ratelimited', methods: '*', ja: '呼び出し回数の上限を超えた（HTTP 429）', en: 'Rate limit exceeded (HTTP 429)' },
  { code: 'missing_scope', methods: '*', ja: 'スコープが足りない。needed / provided を添える', en: 'A scope is missing; needed / provided are included' },
  { code: 'unknown_method', methods: '*', ja: '対応していないメソッド', en: 'The method is not supported' },
  { code: 'invalid_form_data', methods: '*', ja: '本文を読めない、または 1MB を超えた', en: 'The body could not be read or exceeded 1 MB' },
  { code: 'internal_error', methods: '*', ja: 'Cairn 側のエラー', en: 'An error on Cairn’s side' },
  { code: 'channel_not_found', methods: 'chat.*, conversations.members', ja: 'チャンネルがない、または別のワークスペース', en: 'No such channel, or it belongs to another workspace' },
  { code: 'not_in_channel', methods: 'chat.*, conversations.members', ja: 'Bot がチャンネルに追加されていない', en: 'The bot has not been added to the channel' },
  { code: 'is_archived', methods: 'chat.*, conversations.members', ja: 'チャンネル（またはスレッドの親）がアーカイブ済み', en: 'The channel (or the thread’s parent) is archived' },
  { code: 'method_not_supported_for_channel_type', methods: 'chat.*, conversations.members', ja: 'DM には投稿できない', en: 'DMs are not supported' },
  { code: 'no_text', methods: 'chat.postMessage, chat.update', ja: 'text も blocks もない。または blocks から代替テキストを作れない', en: 'Neither text nor blocks, or no fallback text can be built from the blocks' },
  { code: 'msg_too_long', methods: 'chat.postMessage, chat.update', ja: 'text が 40,000 文字を超えた', en: 'text exceeds 40,000 characters' },
  { code: 'invalid_blocks', methods: 'chat.postMessage, chat.update', ja: 'blocks が受け付けられない。理由は response_metadata.messages', en: 'The blocks are not accepted; reasons in response_metadata.messages' },
  { code: 'invalid_blocks_format', methods: 'chat.postMessage, chat.update', ja: 'blocks を JSON として読めない', en: 'blocks is not valid JSON' },
  { code: 'invalid_arguments', methods: 'chat.*, views.*', ja: '引数が不正（thread_ts の指定、UUID でない client_msg_id、view の誤りなど）', en: 'Invalid arguments (thread_ts, a non-UUID client_msg_id, an invalid view, …)' },
  { code: 'client_msg_id_conflict', methods: 'chat.postMessage', ja: '同じ client_msg_id が別のチャンネル・送信者で使われている', en: 'The client_msg_id is already used in another channel or by another sender' },
  { code: 'message_not_found', methods: 'chat.update, chat.delete', ja: 'メッセージがない、または削除済み', en: 'No such message, or it was deleted' },
  { code: 'cant_update_message', methods: 'chat.update', ja: '自分の Bot の投稿ではない', en: 'Not a message from this bot' },
  { code: 'cant_delete_message', methods: 'chat.delete', ja: '自分の Bot の投稿ではない', en: 'Not a message from this bot' },
  { code: 'user_not_found', methods: 'users.info', ja: '有効なメンバーではない', en: 'Not an active member' },
  { code: 'invalid_trigger_id', methods: 'views.open', ja: 'trigger_id が正しくない、または使用済み', en: 'The trigger_id is invalid or already used' },
  { code: 'expired_trigger_id', methods: 'views.open', ja: 'trigger_id の期限（6秒）が切れた', en: 'The trigger_id expired (6 seconds)' },
  { code: 'not_found', methods: 'views.update', ja: 'モーダルがない、または閉じられた', en: 'No such modal, or it was closed' },
  { code: 'hash_conflict', methods: 'views.update', ja: 'hash の版から変わっている', en: 'The view changed since the given hash' },
  { code: 'view_is_submitting', methods: 'views.update', ja: '利用者の送信をアプリへ届けている間は差し替えられない', en: 'The view cannot be replaced while a submission is being delivered' },
]

function errorsTable(locale: DocsLocale) {
  return (
    <Table
      head={locale === 'ja' ? ['error', 'メソッド', '意味'] : ['error', 'Methods', 'Meaning']}
      rows={ERRORS.map((row) => [<code key="c">{row.code}</code>, row.methods === '*' ? (locale === 'ja' ? 'すべて' : 'All') : row.methods, row[locale]])}
    />
  )
}

export const webApiPage: DocPage = {
  slug: 'web-api',
  content: {
    ja: {
      title: 'Bot Web API',
      description:
        'アプリは Bot トークンで Cairn の Web API を呼び、カードの投稿・更新やモーダルの表示を行います。メソッド名・引数・応答・エラーコードは Slack の Web API に合わせています。',
      sections: [
        {
          id: 'request',
          title: 'リクエスト',
          content: (
            <>
              <ul>
                <li>
                  エンドポイントは <code>POST https://oss-cairn.com/api/app-api/&lt;method&gt;</code> です（Slack の{' '}
                  <code>https://slack.com/api/&lt;method&gt;</code> と同じ並び）。セルフホストでは自分のホストに置き換えます
                </li>
                <li>
                  本文は <code>application/x-www-form-urlencoded</code>（Bolt・<code>@slack/web-api</code> の既定）か <code>application/json</code>{' '}
                  です。form で送る <code>blocks</code> / <code>view</code> は JSON 文字列にします。本文は 1MB まで
                </li>
                <li>
                  トークンは <code>Authorization: Bearer &lt;token&gt;</code>、または本文の <code>token</code> で渡します（ヘッダーを優先）
                </li>
              </ul>
              <Code>{curlExample}</Code>
            </>
          ),
        },
        {
          id: 'response',
          title: '応答',
          content: (
            <>
              <p>
                Slack と同じく HTTP ステータスは常に 200 で、成否は <code>ok</code> で表します。失敗すると <code>error</code>{' '}
                にエラーコードが入り、詳しい理由があれば <code>response_metadata.messages</code> に入ります。
              </p>
              <Code>{postResponse}</Code>
              <p>
                例外は呼び出し回数の上限で、トークンごとに毎分 120 回を超えると HTTP 429 と <code>Retry-After: 60</code> を返します（Bolt
                は待って再試行します）。
              </p>
            </>
          ),
        },
        {
          id: 'methods',
          title: 'メソッド',
          content: methodsTable('ja'),
        },
        {
          id: 'chat',
          title: 'chat.postMessage / chat.update / chat.delete',
          content: (
            <ul>
              <li>
                <code>text</code> は通知・検索・引用・カードを描けない環境で使う代替テキストです。省略すると blocks の見出し・本文から組み立てます。
                ボタンだけのカードなど組み立てられないときは <code>no_text</code> になるので、<code>text</code> を指定してください
              </li>
              <li>
                <code>client_msg_id</code>（UUID）を付けるとメッセージの ID として使い、同じ ID の再送は新しく投稿せず既存のメッセージを返します。再試行しても二重に投稿されません
              </li>
              <li>
                <code>thread_ts</code> は使えません。Cairn のスレッドは別のチャンネルなので、スレッドのチャンネル ID を <code>channel</code>{' '}
                に指定します
              </li>
              <li>
                <code>chat.update</code> はカードを更新しても「編集済み」を付けません。<code>text</code> を省くと代替テキストは変えず、
                <code>blocks</code> を省いて <code>text</code> だけを送るとカードを外して通常のメッセージにします（Slack と同じ）
              </li>
              <li>
                <code>chat.update</code> / <code>chat.delete</code> の <code>ts</code> にはメッセージの UUID（投稿の応答の <code>ts</code>）を渡します
              </li>
              <li>Bot の投稿も人の投稿と同じく、メンションの通知と検索の対象になります</li>
            </ul>
          ),
        },
        {
          id: 'members',
          title: 'users.info / conversations.members',
          content: (
            <ul>
              <li>返すのはワークスペースの有効なメンバーだけです。無効化されたメンバーはいないものとして扱います</li>
              <li>
                <code>users.info</code> の <code>user</code> は <code>id</code> / <code>team_id</code> / <code>name</code> / <code>real_name</code>{' '}
                / <code>profile.display_name</code> / <code>profile.image_72</code> などを持ちます。メールアドレスは返しません
              </li>
              <li>
                <code>conversations.members</code> に Bot 自身は含まれません
              </li>
            </ul>
          ),
        },
        {
          id: 'errors',
          title: 'エラーコード',
          content: (
            <>
              {errorsTable('ja')}
              <Note>
                <code>response_metadata.messages</code> の理由の文は現在日本語です。分岐には <code>error</code> のコードを使ってください。
              </Note>
            </>
          ),
        },
      ],
    },
    en: {
      title: 'Bot Web API',
      description:
        'Apps call Cairn’s Web API with a bot token to post and update cards and open modals. Method names, arguments, responses and error codes follow the Slack Web API.',
      sections: [
        {
          id: 'request',
          title: 'Requests',
          content: (
            <>
              <ul>
                <li>
                  The endpoint is <code>POST https://oss-cairn.com/api/app-api/&lt;method&gt;</code> (laid out like Slack’s{' '}
                  <code>https://slack.com/api/&lt;method&gt;</code>). Self-hosted deployments use their own host
                </li>
                <li>
                  Send <code>application/x-www-form-urlencoded</code> (the default of Bolt and <code>@slack/web-api</code>) or{' '}
                  <code>application/json</code>. With form encoding, send <code>blocks</code> / <code>view</code> as JSON strings. Bodies are limited
                  to 1 MB
                </li>
                <li>
                  Pass the token as <code>Authorization: Bearer &lt;token&gt;</code> or as a <code>token</code> body field (the header wins)
                </li>
              </ul>
              <Code>{curlExample}</Code>
            </>
          ),
        },
        {
          id: 'response',
          title: 'Responses',
          content: (
            <>
              <p>
                As in Slack, the HTTP status is always 200 and success is indicated by <code>ok</code>. On failure, <code>error</code> holds an error
                code and <code>response_metadata.messages</code> holds details when available.
              </p>
              <Code>{postResponse}</Code>
              <p>
                The exception is rate limiting: above 120 calls per minute per token, Cairn returns HTTP 429 with <code>Retry-After: 60</code> (Bolt
                waits and retries).
              </p>
            </>
          ),
        },
        {
          id: 'methods',
          title: 'Methods',
          content: methodsTable('en'),
        },
        {
          id: 'chat',
          title: 'chat.postMessage / chat.update / chat.delete',
          content: (
            <ul>
              <li>
                <code>text</code> is the fallback used for notifications, search, quotes and clients that cannot draw the card. If omitted, Cairn builds
                it from the blocks’ headers and text. When nothing can be built (e.g. a card with only buttons) you get <code>no_text</code>, so pass{' '}
                <code>text</code>
              </li>
              <li>
                <code>client_msg_id</code> (a UUID) becomes the message ID; a retry with the same ID returns the existing message instead of posting
                again, so retries never double-post
              </li>
              <li>
                <code>thread_ts</code> is not supported. Threads in Cairn are separate channels, so pass the thread’s channel ID as{' '}
                <code>channel</code>
              </li>
              <li>
                <code>chat.update</code> does not mark the message as edited. Omitting <code>text</code> keeps the fallback text; sending only{' '}
                <code>text</code> without <code>blocks</code> removes the card and turns it into a regular message (as in Slack)
              </li>
              <li>
                For <code>chat.update</code> / <code>chat.delete</code>, pass the message UUID (the <code>ts</code> from the post response) as{' '}
                <code>ts</code>
              </li>
              <li>Like messages from people, bot messages trigger mention notifications and are searchable</li>
            </ul>
          ),
        },
        {
          id: 'members',
          title: 'users.info / conversations.members',
          content: (
            <ul>
              <li>Only active workspace members are returned; deactivated members are treated as absent</li>
              <li>
                The <code>user</code> from <code>users.info</code> has <code>id</code>, <code>team_id</code>, <code>name</code>, <code>real_name</code>
                , <code>profile.display_name</code>, <code>profile.image_72</code> and so on. Email addresses are not returned
              </li>
              <li>
                <code>conversations.members</code> does not include the bot itself
              </li>
            </ul>
          ),
        },
        {
          id: 'errors',
          title: 'Error codes',
          content: (
            <>
              {errorsTable('en')}
              <Note>
                Reason texts in <code>response_metadata.messages</code> are currently in Japanese. Branch on the <code>error</code> code.
              </Note>
            </>
          ),
        },
      ],
    },
  },
}
