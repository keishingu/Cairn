// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { Code, Table, type DocPage } from '../_components/doc'

const boltExample = `
const { App } = require('@slack/bolt')

const app = new App({
  token: process.env.CAIRN_BOT_TOKEN, // cairn_bot_...
  signingSecret: process.env.CAIRN_SIGNING_SECRET,
  // Web API の向き先を Cairn に差し替える（末尾の / を付ける）
  clientOptions: { slackApiUrl: 'https://oss-cairn.com/api/app-api/' },
})

app.action('vote', async ({ ack, body, client }) => {
  await ack()
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'Thanks for voting',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*Voted!*' } }],
  })
})

app.start(3000)
`

const boltExampleEn = boltExample.replace('// Web API の向き先を Cairn に差し替える（末尾の / を付ける）', '// Point the Web API at Cairn (keep the trailing slash)')

export const overviewPage: DocPage = {
  slug: '',
  content: {
    ja: {
      title: 'Cairn アプリ開発ガイド',
      description:
        'Cairn のチャンネルに Bot としてカード（Block Kit 互換のメッセージ）を投稿し、ボタン・選択・モーダルの操作を受け取るアプリの仕様です。ワイヤフォーマットは Slack に合わせており、Bolt for JavaScript で書いたアプリは API の向き先を差し替えるだけで動くことを目指しています。',
      sections: [
        {
          id: 'model',
          title: 'アプリの仕組み',
          content: (
            <>
              <p>アプリは次の3つの経路で Cairn とやり取りします。</p>
              <Table
                head={['向き', '経路', '詳細']}
                rows={[
                  [
                    'アプリ → Cairn',
                    <>
                      Bot トークンで <code>POST /api/app-api/&lt;method&gt;</code> を呼ぶ（投稿・更新・モーダル）
                    </>,
                    <Link key="api" href="/developers/web-api">
                      Bot Web API
                    </Link>,
                  ],
                  [
                    'Cairn → アプリ',
                    'カードのボタン・選択、モーダルの送信、メニューからの起動を、署名付きで Request URL へ POST する',
                    <Link key="int" href="/developers/interactions">
                      インタラクション
                    </Link>,
                  ],
                  [
                    '利用者',
                    'チャンネルに出たカードを操作し、アプリが開いたモーダルに入力する（Web・デスクトップ・iOS / Android）',
                    <Link key="blocks" href="/developers/blocks">
                      カード
                    </Link>,
                  ],
                ]}
              />
              <p>
                アプリはワークスペースへ<strong>インストール</strong>され、インストールごとに Bot（送信者）と Bot トークンを持ちます。Bot
                が投稿できるのは、利用者が Bot を追加したチャンネルだけです。Bot の発言には常に「アプリ」のバッジが付き、人間のメンバーと区別して表示されます。
              </p>
            </>
          ),
        },
        {
          id: 'bolt',
          title: 'Bolt for JavaScript から使う',
          content: (
            <>
              <p>
                Bolt の <code>clientOptions.slackApiUrl</code> を Cairn の API に向けると、<code>client.chat.postMessage</code> などがそのまま Cairn
                を呼びます。インタラクションの署名ヘッダーも Slack と同じ <code>X-Slack-Signature</code> なので、Bolt の署名検証がそのまま通ります。
              </p>
              <Code>{boltExample}</Code>
              <p>
                Cairn がサポートするのは Slack API の一部です。使えるメソッドやブロック、Slack と違う点は{' '}
                <Link href="/developers/slack-differences">Slack との違い</Link>にまとめています。
              </p>
            </>
          ),
        },
        {
          id: 'scopes',
          title: 'スコープと権限',
          content: (
            <>
              <p>スコープの名前は Slack に合わせています。</p>
              <Table
                head={['スコープ', '許す操作']}
                rows={[
                  [
                    <code key="s">chat:write</code>,
                    'Bot が参加しているチャンネルへの投稿、自分の投稿の更新・削除',
                  ],
                  [<code key="s">users:read</code>, 'ワークスペースの有効なメンバーの ID・表示名・アイコンの参照'],
                  [<code key="s">channels:read</code>, 'Bot が参加しているチャンネルのメンバー一覧の参照'],
                ]}
              />
              <ul>
                <li>
                  <code>auth.test</code> と <code>views.open</code> / <code>views.update</code> はスコープを要しません（モーダルは、利用者の操作で発行された{' '}
                  <code>trigger_id</code> がある間だけ開けます）
                </li>
                <li>インタラクションの受信はスコープではなく、Request URL の登録で有効になります</li>
                <li>アプリのインストール・アンインストールはワークスペースのオーナー・管理者が行います</li>
                <li>Bot をチャンネルへ追加・外すのは、そのチャンネルにアクセスできるメンバーです。DM には Bot を追加できません</li>
                <li>カードを操作できるのは、そのチャンネルを読めるメンバー（ゲストを含む）です。無効化されたメンバーは操作できません</li>
              </ul>
            </>
          ),
        },
        {
          id: 'ids',
          title: 'トークンと ID',
          content: (
            <>
              <ul>
                <li>
                  Bot トークンは <code>cairn_bot_</code> で始まる文字列です（Slack の <code>xoxb-</code> ではありません）。
                  <code>Authorization: Bearer &lt;token&gt;</code> ヘッダー、または本文の <code>token</code> で渡します
                </li>
                <li>
                  ワークスペース・利用者・チャンネル・メッセージの ID は UUID です。メッセージの <code>ts</code> にもメッセージの UUID が入ります（Slack の{' '}
                  <code>1700000000.000100</code> 形式ではありません）
                </li>
                <li>
                  ID の形は今後 Slack に近い形式へ変わる可能性があります。変わっても UUID を読み続けられるよう、ペイロードには Cairn 独自の{' '}
                  <code>cairn</code> オブジェクトで UUID を併記しています
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'pages',
          title: 'このドキュメントの構成',
          content: (
            <ul>
              <li>
                <Link href="/developers/blocks">カード（ブロックと要素）</Link> — 受け付けるブロック・要素・上限、mrkdwn の記法
              </li>
              <li>
                <Link href="/developers/web-api">Bot Web API</Link> — メソッド、リクエストの形、エラーコード
              </li>
              <li>
                <Link href="/developers/interactions">インタラクション</Link> — 配送、署名、3秒の期限、ペイロード
              </li>
              <li>
                <Link href="/developers/modals">モーダル</Link> — <code>views.open</code>、<code>view_submission</code>、入力エラーの返し方
              </li>
              <li>
                <Link href="/developers/slack-differences">Slack との違い</Link> — 未対応の機能と、挙動が違う点
              </li>
            </ul>
          ),
        },
      ],
    },
    en: {
      title: 'Building apps for Cairn',
      description:
        'This is the specification for apps that post cards (Block Kit–compatible messages) to Cairn channels as a bot and receive button, select and modal interactions. The wire format follows Slack, so that an app written with Bolt for JavaScript can run against Cairn by changing only the API endpoint.',
      sections: [
        {
          id: 'model',
          title: 'How apps work',
          content: (
            <>
              <p>An app talks to Cairn over three paths.</p>
              <Table
                head={['Direction', 'Path', 'Details']}
                rows={[
                  [
                    'App → Cairn',
                    <>
                      Call <code>POST /api/app-api/&lt;method&gt;</code> with a bot token (post, update, open modals)
                    </>,
                    <Link key="api" href="/developers/en/web-api">
                      Bot Web API
                    </Link>,
                  ],
                  [
                    'Cairn → App',
                    'Button presses, selections, modal submissions and menu launches are POSTed, signed, to your Request URL',
                    <Link key="int" href="/developers/en/interactions">
                      Interactions
                    </Link>,
                  ],
                  [
                    'People',
                    'Members use the cards in a channel and fill in the modals your app opens (web, desktop, iOS / Android)',
                    <Link key="blocks" href="/developers/en/blocks">
                      Cards
                    </Link>,
                  ],
                ]}
              />
              <p>
                An app is <strong>installed</strong> into a workspace, and each installation has its own bot (the sender) and bot token. A bot can only
                post to channels that members have added it to. Messages from a bot always carry an “App” badge so they are never mistaken for a person.
              </p>
            </>
          ),
        },
        {
          id: 'bolt',
          title: 'Using Bolt for JavaScript',
          content: (
            <>
              <p>
                Point Bolt’s <code>clientOptions.slackApiUrl</code> at Cairn and <code>client.chat.postMessage</code> and friends call Cairn directly.
                Interactions are signed with the same <code>X-Slack-Signature</code> header as Slack, so Bolt’s signature verification works unchanged.
              </p>
              <Code>{boltExampleEn}</Code>
              <p>
                Cairn supports a subset of the Slack API. See <Link href="/developers/en/slack-differences">Differences from Slack</Link> for the
                supported methods and blocks and for behaviour that differs.
              </p>
            </>
          ),
        },
        {
          id: 'scopes',
          title: 'Scopes and permissions',
          content: (
            <>
              <p>Scope names follow Slack.</p>
              <Table
                head={['Scope', 'Allows']}
                rows={[
                  [<code key="s">chat:write</code>, 'Posting to channels the bot is in, and updating or deleting its own messages'],
                  [<code key="s">users:read</code>, 'Reading the ID, display name and avatar of active workspace members'],
                  [<code key="s">channels:read</code>, 'Listing the members of channels the bot is in'],
                ]}
              />
              <ul>
                <li>
                  <code>auth.test</code>, <code>views.open</code> and <code>views.update</code> need no scope (a modal can only be opened while a{' '}
                  <code>trigger_id</code> issued by a member’s action is valid)
                </li>
                <li>Receiving interactions is enabled by registering a Request URL, not by a scope</li>
                <li>Workspace owners and admins install and uninstall apps</li>
                <li>Any member with access to a channel can add the bot to it or remove it. Bots cannot be added to DMs</li>
                <li>Anyone who can read the channel (guests included) can use its cards. Deactivated members cannot</li>
              </ul>
            </>
          ),
        },
        {
          id: 'ids',
          title: 'Tokens and IDs',
          content: (
            <ul>
              <li>
                Bot tokens start with <code>cairn_bot_</code> (not Slack’s <code>xoxb-</code>). Send them in an{' '}
                <code>Authorization: Bearer &lt;token&gt;</code> header or as a <code>token</code> field in the body
              </li>
              <li>
                Workspace, user, channel and message IDs are UUIDs. A message’s <code>ts</code> is also the message UUID (not Slack’s{' '}
                <code>1700000000.000100</code> format)
              </li>
              <li>
                IDs may move to a more Slack-like format in the future. So that you can keep reading UUIDs when that happens, payloads also carry them in a
                Cairn-specific <code>cairn</code> object
              </li>
            </ul>
          ),
        },
        {
          id: 'pages',
          title: 'In this guide',
          content: (
            <ul>
              <li>
                <Link href="/developers/en/blocks">Cards (blocks and elements)</Link> — accepted blocks, elements and limits, and mrkdwn syntax
              </li>
              <li>
                <Link href="/developers/en/web-api">Bot Web API</Link> — methods, request format and error codes
              </li>
              <li>
                <Link href="/developers/en/interactions">Interactions</Link> — delivery, signing, the 3-second deadline and payloads
              </li>
              <li>
                <Link href="/developers/en/modals">Modals</Link> — <code>views.open</code>, <code>view_submission</code> and returning input errors
              </li>
              <li>
                <Link href="/developers/en/slack-differences">Differences from Slack</Link> — what is not supported and what behaves differently
              </li>
            </ul>
          ),
        },
      ],
    },
  },
}
