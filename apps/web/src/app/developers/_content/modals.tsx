// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { BLOCK_LIMITS } from '@cairn/shared'
import { Code, Note, Table, type DocPage } from '../_components/doc'

const openExample = `
app.command('/poll', async ({ ack, body, client }) => {
  await ack()
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'create_poll',
      title: { type: 'plain_text', text: 'New poll' },
      submit: { type: 'plain_text', text: 'Post' },
      private_metadata: body.channel_id,
      blocks: [
        {
          type: 'input',
          block_id: 'question',
          label: { type: 'plain_text', text: 'Question' },
          element: { type: 'plain_text_input', action_id: 'value', max_length: 200 },
        },
      ],
    },
  })
})
`

const submissionExample = `
{
  "type": "view_submission",
  "team": { "id": "<workspace UUID>", "domain": "<slug>" },
  "user": { "id": "<user UUID>", "name": "<display name>", "team_id": "<workspace UUID>" },
  "api_app_id": "<app UUID>",
  "token": "",
  "trigger_id": "<one-time ID>",
  "view": {
    "type": "modal",
    "id": "<view UUID>",
    "hash": "<hash>",
    "callback_id": "create_poll",
    "private_metadata": "<channel UUID>",
    "title": { ... }, "submit": { ... }, "blocks": [ ... ],
    "state": {
      "values": {
        "question": { "value": { "type": "plain_text_input", "value": "Where shall we go?" } }
      }
    }
  },
  "cairn": { "interaction_id": "<UUID>", "channel_id": "<channel UUID>", "locale": "en" }
}
`

const errorsExample = `
app.view('create_poll', async ({ ack, view }) => {
  const question = view.state.values.question.value.value
  if (question.includes('?') === false) {
    await ack({ response_action: 'errors', errors: { question: 'End the question with “?”' } })
    return
  }
  await ack() // 空の 200 でモーダルを閉じる
  // 投稿などの重い処理は ack の後に行う
})
`

const errorsExampleEn = errorsExample
  .replace('// 空の 200 でモーダルを閉じる', '// an empty 200 closes the modal')
  .replace('// 投稿などの重い処理は ack の後に行う', '// do slow work such as posting after the ack')

export const modalsPage: DocPage = {
  slug: 'modals',
  content: {
    ja: {
      title: 'モーダル',
      description:
        'アプリは利用者の操作で発行された trigger_id を使って入力フォーム（モーダル）を開き、送信を view_submission として受け取ります。Web とデスクトップではダイアログ、モバイルではシートとして表示されます。',
      sections: [
        {
          id: 'open',
          title: 'モーダルを開く',
          content: (
            <>
              <p>
                <code>views.open</code> に <code>trigger_id</code> と <code>view</code> を渡します。<code>trigger_id</code> は 1回だけ使え、発行から6秒で失効します。
              </p>
              <Code>{openExample}</Code>
              <Table
                head={['フィールド', '内容']}
                rows={[
                  [<code key="f">type</code>, <><code>modal</code> 固定</>],
                  [<code key="f">title</code>, `plain_text、${BLOCK_LIMITS.modalTitle} 文字まで`],
                  [<code key="f">submit / close</code>, `plain_text、${BLOCK_LIMITS.modalButton} 文字まで。input を含むモーダルには submit が必要`],
                  [<code key="f">blocks</code>, <>{BLOCK_LIMITS.modalBlocks} ブロックまで。<Link href="/developers/blocks">カード</Link>のブロックに加えて input が使える</>],
                  [<code key="f">private_metadata</code>, `${BLOCK_LIMITS.privateMetadata} 文字まで。送信時にそのまま返る`],
                  [<code key="f">callback_id</code>, `${BLOCK_LIMITS.callbackId} 文字まで`],
                ]}
              />
              <p>
                応答の <code>view</code> には <code>id</code> と <code>hash</code> が付きます。<code>views.update</code> で差し替えるときに使います。
              </p>
            </>
          ),
        },
        {
          id: 'submission',
          title: 'view_submission',
          content: (
            <>
              <p>
                利用者が送信すると、<code>payload=&lt;JSON&gt;</code> で次の形を Request URL へ送ります。入力値は Slack と同じ{' '}
                <code>view.state.values[block_id][action_id]</code> にあります。
              </p>
              <Code>{submissionExample}</Code>
              <ul>
                <li>
                  届ける前に、Cairn が必須・<code>min_length</code> / <code>max_length</code>・選択肢を検証します。満たさない送信はアプリへ届けず、利用者に入力エラーを出します
                </li>
                <li>
                  <code>static_select</code> の値は <code>{'{ "type": "static_select", "selected_option": { ... } }'}</code> で、未選択の任意項目は{' '}
                  <code>null</code> です
                </li>
                <li>同じモーダルからの同時の送信は1つだけを届けます</li>
                <li>
                  <code>trigger_id</code> も付くので、送信への応答の後で別のモーダルを開けます
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'response',
          title: '送信への応答',
          content: (
            <>
              <p>3秒以内に、次のいずれかを返します。</p>
              <Table
                head={['応答', '結果']}
                rows={[
                  ['空の 200', 'モーダルを閉じる'],
                  [<code key="r">{'{"response_action":"clear"}'}</code>, 'モーダルを閉じる'],
                  [
                    <code key="r">{'{"response_action":"errors","errors":{...}}'}</code>,
                    <>
                      モーダルを開いたまま、<code>errors</code> のキー（input の <code>block_id</code>）の欄にメッセージを出す
                    </>,
                  ],
                  [<code key="r">{'{"response_action":"update","view":{...}}'}</code>, 'モーダルを差し替える'],
                  [<code key="r">{'{"response_action":"push","view":{...}}'}</code>, <>重ねずに差し替える（<code>update</code> と同じ）</>],
                ]}
              />
              <Code>{errorsExample}</Code>
              <ul>
                <li>
                  <code>errors</code> のメッセージは 300 文字までです。今のモーダルにない <code>block_id</code> だけの <code>errors</code>{' '}
                  は不正な応答として扱います
                </li>
                <li>
                  JSON として読めない応答や不正な <code>view</code> を返すと、モーダルを開いたまま利用者にエラーを出します（入力は失われません）
                </li>
                <li>
                  期限切れ・2xx 以外でもモーダルは開いたままです。利用者が送り直すと同じ <code>cairn.interaction_id</code> で届きます
                </li>
                <li>
                  <code>errors</code> を返した後に直して送られた送信は、新しい <code>cairn.interaction_id</code> になります
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'update',
          title: 'views.update',
          content: (
            <ul>
              <li>
                <code>view_id</code> と新しい <code>view</code> を渡します。<code>hash</code> を付けると、その版のままのときだけ差し替えます（変わっていれば{' '}
                <code>hash_conflict</code>）
              </li>
              <li>
                利用者の送信をアプリへ届けている間は <code>view_is_submitting</code> になります。送信への応答で差し替えるときは{' '}
                <code>response_action: update</code> を返してください
              </li>
              <li>
                閉じられたモーダルは <code>not_found</code> になります
              </li>
            </ul>
          ),
        },
        {
          id: 'limits',
          title: 'モーダルでまだできないこと',
          content: (
            <Note>
              <ul>
                <li>
                  <code>views.push</code> とモーダルの積み重ね（<code>push</code> は差し替えになります）
                </li>
                <li>
                  モーダルを閉じたときの <code>view_closed</code>（<code>notify_on_close</code>）
                </li>
                <li>モーダル内のボタン・選択の操作（block_actions）の配送</li>
                <li>
                  モーダルの input 内の <code>static_select</code> の <code>confirm</code>、<code>markdown</code> ブロック
                </li>
              </ul>
            </Note>
          ),
        },
      ],
    },
    en: {
      title: 'Modals',
      description:
        'Your app opens an input form (a modal) with a trigger_id issued by a member’s action, and receives the submission as view_submission. Modals appear as dialogs on the web and desktop and as sheets on mobile.',
      sections: [
        {
          id: 'open',
          title: 'Opening a modal',
          content: (
            <>
              <p>
                Pass a <code>trigger_id</code> and a <code>view</code> to <code>views.open</code>. A <code>trigger_id</code> can be used once and
                expires 6 seconds after it is issued.
              </p>
              <Code>{openExample}</Code>
              <Table
                head={['Field', 'Contents']}
                rows={[
                  [<code key="f">type</code>, <>Always <code>modal</code></>],
                  [<code key="f">title</code>, `plain_text, up to ${BLOCK_LIMITS.modalTitle} characters`],
                  [<code key="f">submit / close</code>, `plain_text, up to ${BLOCK_LIMITS.modalButton} characters. submit is required when the modal has an input`],
                  [<code key="f">blocks</code>, <>Up to {BLOCK_LIMITS.modalBlocks} blocks: the <Link href="/developers/en/blocks">card</Link> blocks plus input</>],
                  [<code key="f">private_metadata</code>, `Up to ${BLOCK_LIMITS.privateMetadata} characters, returned as-is on submission`],
                  [<code key="f">callback_id</code>, `Up to ${BLOCK_LIMITS.callbackId} characters`],
                ]}
              />
              <p>
                The returned <code>view</code> has an <code>id</code> and a <code>hash</code>, used to replace it with <code>views.update</code>.
              </p>
            </>
          ),
        },
        {
          id: 'submission',
          title: 'view_submission',
          content: (
            <>
              <p>
                When the member submits, Cairn sends the following as <code>payload=&lt;JSON&gt;</code> to your Request URL. Values are at{' '}
                <code>view.state.values[block_id][action_id]</code>, as in Slack.
              </p>
              <Code>{submissionExample}</Code>
              <ul>
                <li>
                  Before delivering, Cairn checks required fields, <code>min_length</code> / <code>max_length</code> and options. Submissions that fail
                  are not delivered; the member sees the input errors
                </li>
                <li>
                  A <code>static_select</code> value is <code>{'{ "type": "static_select", "selected_option": { ... } }'}</code>, and{' '}
                  <code>null</code> for an optional field left empty
                </li>
                <li>Only one of several simultaneous submissions from the same modal is delivered</li>
                <li>
                  A <code>trigger_id</code> is included, so you can open another modal after responding
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'response',
          title: 'Responding to a submission',
          content: (
            <>
              <p>Within 3 seconds, return one of:</p>
              <Table
                head={['Response', 'Result']}
                rows={[
                  ['Empty 200', 'Closes the modal'],
                  [<code key="r">{'{"response_action":"clear"}'}</code>, 'Closes the modal'],
                  [
                    <code key="r">{'{"response_action":"errors","errors":{...}}'}</code>,
                    <>
                      Keeps the modal open and shows each message under the input whose <code>block_id</code> is the key
                    </>,
                  ],
                  [<code key="r">{'{"response_action":"update","view":{...}}'}</code>, 'Replaces the modal'],
                  [<code key="r">{'{"response_action":"push","view":{...}}'}</code>, <>Replaces instead of stacking (same as <code>update</code>)</>],
                ]}
              />
              <Code>{errorsExampleEn}</Code>
              <ul>
                <li>
                  Error messages are limited to 300 characters. <code>errors</code> that name only <code>block_id</code>s absent from the current modal
                  are treated as an invalid response
                </li>
                <li>
                  An unreadable (non-JSON) response or an invalid <code>view</code> keeps the modal open and shows an error; the member’s input is kept
                </li>
                <li>
                  On a timeout or a non-2xx status the modal also stays open. If the member resubmits, it arrives with the same{' '}
                  <code>cairn.interaction_id</code>
                </li>
                <li>
                  A corrected submission after you returned <code>errors</code> gets a new <code>cairn.interaction_id</code>
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'update',
          title: 'views.update',
          content: (
            <ul>
              <li>
                Pass the <code>view_id</code> and a new <code>view</code>. With a <code>hash</code>, the view is only replaced if it is still that
                version (otherwise <code>hash_conflict</code>)
              </li>
              <li>
                While a member’s submission is being delivered to your app you get <code>view_is_submitting</code>; to replace the view in reply to a
                submission, return <code>response_action: update</code>
              </li>
              <li>
                A closed modal returns <code>not_found</code>
              </li>
            </ul>
          ),
        },
        {
          id: 'limits',
          title: 'Not yet supported in modals',
          content: (
            <Note>
              <ul>
                <li>
                  <code>views.push</code> and stacked modals (<code>push</code> replaces)
                </li>
                <li>
                  <code>view_closed</code> when a modal is dismissed (<code>notify_on_close</code>)
                </li>
                <li>Delivering button and select actions (block_actions) from inside a modal</li>
                <li>
                  <code>confirm</code> on a <code>static_select</code> inside an input, and the <code>markdown</code> block
                </li>
              </ul>
            </Note>
          ),
        },
      ],
    },
  },
}
