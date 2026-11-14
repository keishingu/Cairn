// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { Table, type DocPage } from '../_components/doc'

export const slackDifferencesPage: DocPage = {
  slug: 'slack-differences',
  content: {
    ja: {
      title: 'Slack との違い',
      description:
        'Cairn は Slack API の全面互換ではなく、Bolt で書いたカードとインタラクションのアプリが動く最小限を実装しています。Slack と挙動が違う点と、まだ対応していない機能をまとめます。',
      sections: [
        {
          id: 'differences',
          title: '挙動が違う点',
          content: (
            <Table
              head={['項目', 'Slack', 'Cairn']}
              rows={[
                ['ID の形式', <><code key="a">T…</code> / <code>U…</code> / <code>C…</code>、<code>ts</code> は <code>1700000000.000100</code></>, 'すべて UUID。ts もメッセージの UUID'],
                ['Bot トークン', <code key="a">xoxb-…</code>, <code key="b">cairn_bot_…</code>],
                ['スレッド', <><code key="a">thread_ts</code> で同じチャンネル内に返信</>, <>スレッドは別チャンネル。<code>thread_ts</code> は <code>invalid_arguments</code></>],
                ['DM への投稿', '可能', '不可（method_not_supported_for_channel_type）'],
                ['text を省いた投稿', '警告付きで受け付ける', <>blocks から代替テキストを組み立てる。作れなければ <code key="a">no_text</code></>],
                ['chat.update', '「編集済み」が付く', '付かない'],
                ['conversations.members', 'cursor でページ分割', 'ページ分割なし（next_cursor は常に空）'],
                ['trigger_id の期限', '3秒', '発行から6秒、1回限り'],
                ['response_action: push', 'モーダルを重ねる', '重ねずに差し替える'],
                ['URL', 'http も可', 'https のみ'],
                ['エラーの理由の文', '英語', '現在は日本語（error コードは Slack と同じ名前）'],
                ['ペイロードの追加', '—', <><code key="a">cairn.*</code>（message_id / interaction_id / channel_id / locale）、起動の form の <code>locale</code></>],
                ['独自の要素', '—', <code key="a">meter</code>],
              ]}
            />
          ),
        },
        {
          id: 'unsupported',
          title: 'まだ対応していないもの',
          content: (
            <ul>
              <li>
                外部のアプリの登録、OAuth v2 によるインストール（<code>oauth.v2.access</code>）、アプリのマニフェスト
              </li>
              <li>
                <code>response_url</code>（Bolt の <code>respond()</code>）とエフェメラルメッセージ（<code>chat.postEphemeral</code>）
              </li>
              <li>Events API（メッセージ・メンションなどの通知）と、入力欄でのスラッシュコマンドの入力</li>
              <li>
                <code>views.push</code>、<code>view_closed</code>、モーダル内のボタン・選択の配送
              </li>
              <li>
                ブロック: <code>rich_text</code>、<code>video</code>、<code>file</code>
              </li>
              <li>
                要素: <code>datepicker</code>、<code>checkboxes</code>、<code>radio_buttons</code>、<code>overflow</code>、<code>users_select</code>{' '}
                などの <code>*_select</code>、<code>multi_*_select</code>、<code>static_select</code> の <code>option_groups</code>
              </li>
              <li>
                上記以外の Web API メソッド（<code>conversations.*</code> の大半、<code>files.*</code>、<code>reactions.*</code> など）
              </li>
            </ul>
          ),
        },
        {
          id: 'not-planned',
          title: '対応しない予定のもの',
          content: (
            <ul>
              <li>Socket Mode（Request URL への HTTP 送信だけにします）</li>
              <li>RTM API、レガシーの verification token、Incoming Webhooks 単体、Workflow Builder</li>
              <li>Slack のワークスペースとの双方向の連携</li>
            </ul>
          ),
        },
      ],
    },
    en: {
      title: 'Differences from Slack',
      description:
        'Cairn is not a full Slack API clone; it implements the minimum needed for card-and-interaction apps written with Bolt. This page lists behaviour that differs from Slack and features not yet supported.',
      sections: [
        {
          id: 'differences',
          title: 'Behaviour that differs',
          content: (
            <Table
              head={['Topic', 'Slack', 'Cairn']}
              rows={[
                ['ID format', <><code key="a">T…</code> / <code>U…</code> / <code>C…</code>, <code>ts</code> like <code>1700000000.000100</code></>, 'All UUIDs; ts is the message UUID'],
                ['Bot tokens', <code key="a">xoxb-…</code>, <code key="b">cairn_bot_…</code>],
                ['Threads', <>Reply in the same channel with <code key="a">thread_ts</code></>, <>Threads are separate channels; <code>thread_ts</code> gives <code>invalid_arguments</code></>],
                ['Posting to DMs', 'Allowed', 'Not allowed (method_not_supported_for_channel_type)'],
                ['Posting without text', 'Accepted with a warning', <>Fallback text is built from the blocks; <code key="a">no_text</code> if it cannot be</>],
                ['chat.update', 'Marks the message edited', 'Does not'],
                ['conversations.members', 'Paginated with a cursor', 'Not paginated (next_cursor is always empty)'],
                ['trigger_id lifetime', '3 seconds', '6 seconds from issue, single use'],
                ['response_action: push', 'Stacks modals', 'Replaces instead of stacking'],
                ['URLs', 'http allowed', 'https only'],
                ['Error reason texts', 'English', 'Currently Japanese (error codes use Slack’s names)'],
                ['Extra payload fields', '—', <><code key="a">cairn.*</code> (message_id / interaction_id / channel_id / locale), and <code>locale</code> in launch forms</>],
                ['Cairn-only elements', '—', <code key="a">meter</code>],
              ]}
            />
          ),
        },
        {
          id: 'unsupported',
          title: 'Not supported yet',
          content: (
            <ul>
              <li>
                Registering external apps, installing via OAuth v2 (<code>oauth.v2.access</code>), and app manifests
              </li>
              <li>
                <code>response_url</code> (Bolt’s <code>respond()</code>) and ephemeral messages (<code>chat.postEphemeral</code>)
              </li>
              <li>The Events API (message and mention events), and typing slash commands into the composer</li>
              <li>
                <code>views.push</code>, <code>view_closed</code>, and delivering button and select actions from inside modals
              </li>
              <li>
                Blocks: <code>rich_text</code>, <code>video</code>, <code>file</code>
              </li>
              <li>
                Elements: <code>datepicker</code>, <code>checkboxes</code>, <code>radio_buttons</code>, <code>overflow</code>, <code>*_select</code>{' '}
                such as <code>users_select</code>, <code>multi_*_select</code>, and <code>option_groups</code> on <code>static_select</code>
              </li>
              <li>
                Web API methods not listed (most of <code>conversations.*</code>, <code>files.*</code>, <code>reactions.*</code>, …)
              </li>
            </ul>
          ),
        },
        {
          id: 'not-planned',
          title: 'Not planned',
          content: (
            <ul>
              <li>Socket Mode (Cairn only sends HTTP requests to your Request URL)</li>
              <li>The RTM API, legacy verification tokens, standalone Incoming Webhooks, and Workflow Builder</li>
              <li>Two-way bridging with Slack workspaces</li>
            </ul>
          ),
        },
      ],
    },
  },
}
