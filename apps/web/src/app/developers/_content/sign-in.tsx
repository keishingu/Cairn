// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { Code, Note, Table, type DocPage } from '../_components/doc'

const verifyExample = `
import { createRemoteJWKSet, jwtVerify } from 'jose'

// issuer は https://oss-cairn.com/oidc
const issuer = 'https://oss-cairn.com/oidc'
const jwks = createRemoteJWKSet(new URL(\`\${issuer}/jwks.json\`))

const { payload } = await jwtVerify(idToken, jwks, {
  issuer,
  audience: process.env.CAIRN_OIDC_CLIENT_ID,
  algorithms: ['ES256'],
})
// 認可リクエストに付けて保存した nonce と一致しなければログインさせない
if (payload.nonce !== savedNonce) throw new Error('nonce mismatch')
const cairnUserId = payload.sub
`

const verifyExampleEn = verifyExample
  .replace('// issuer は https://oss-cairn.com/oidc', '// The issuer is https://oss-cairn.com/oidc')
  .replace('// 認可リクエストに付けて保存した nonce と一致しなければログインさせない', '// Reject the sign-in unless nonce matches the one you stored with the authorization request')

export const signInPage: DocPage = {
  slug: 'sign-in',
  content: {
    ja: {
      title: 'Cairn でログイン（OIDC）',
      description:
        'Cairn の外に画面を持つアプリ（Web アプリ・PWA など）が、利用者を Cairn のユーザーとして識別するための OpenID Connect の仕様です。アプリに渡るのは、利用者が許可した情報を載せた ID トークンだけで、Cairn のデータの読み書きには使えません。',
      sections: [
        {
          id: 'scope',
          title: 'できること・できないこと',
          content: (
            <>
              <p>
                ID トークンの <code>sub</code> で、利用者の Cairn のユーザー ID が分かります。ID トークンは Cairn の OIDC 専用の鍵で署名されていて、Cairn の API・データ・ファイル・Realtime には使えません。
              </p>
              <Table
                head={['やりたいこと', '使う仕組み']}
                rows={[
                  ['利用者が誰かを知る（ログイン）', '本ページの OIDC（ID トークン）'],
                  ['チャンネルへの投稿・カード・操作の受け取り', 'Bot トークンと Web API・インタラクション'],
                ]}
              />
              <Note>ID トークンにはワークスペースの所属もロールも含まれません。特定のワークスペースのメンバーだけを入れたい場合は、Bot の Web API（users.info など）で sub が active なメンバーかを確かめてください。</Note>
            </>
          ),
        },
        {
          id: 'register',
          title: 'クライアントの登録',
          content: (
            <p>
              クライアントは Cairn の運営者が登録します（動的登録には対応していません）。アプリの名前、環境ごとのリダイレクト URI（https、完全一致。ローカル開発用の <code>http://localhost</code> / <code>http://127.0.0.1</code> も登録できます）、サーバーを持つかどうかをお知らせください。サーバーを持つアプリは機密クライアントとして client ID と client secret をお渡しします。client secret はサーバーだけに置いてください。ブラウザーだけで動くアプリ（サーバーを持たない PWA など）は、secret を安全に置けないため公開クライアントとして登録し、client ID だけをお渡しします。どちらも PKCE（S256）は必須です。
            </p>
          ),
        },
        {
          id: 'flow',
          title: 'ログインの流れ',
          content: (
            <>
              <ol>
                <li>認可コード + PKCE で <code>https://oss-cairn.com/oidc/authorize</code> に認可リクエストを送ります。スコープは <code>openid</code> を基本に、必要なものだけ（<code>profile</code> / <code>email</code>）を足してください。</li>
                <li><code>state</code> を必ず使います。推測できない値を作ってログイン開始時のセッションに保存し、コールバックで一致を確かめてください。一致しなければコードを交換しないでください。<code>nonce</code> も付けることをおすすめします。</li>
                <li>利用者は Cairn の同意画面で許可・拒否します。以前に同じスコープで許可していれば、同意画面は出ません。</li>
                <li>コールバックで受け取ったコードを token エンドポイントで交換し、ID トークンを受け取ります。リフレッシュトークンは発行しません。Cairn のログインが要るたびに、もう一度認可リクエストを送ってください（許可済みなら同意画面は出ません）。</li>
              </ol>
              <p>エンドポイントは <code>https://oss-cairn.com/oidc/.well-known/openid-configuration</code> から読んでください。直書きしないでください。</p>
              <Table
                head={['スコープ', 'ID トークンに入る情報']}
                rows={[
                  [<code key="a">openid</code>, <><code>sub</code>（Cairn のユーザー ID）</>],
                  [<code key="a">profile</code>, <><code>name</code>（Cairn のアカウントの表示名。ワークスペースごとの表示名とは異なる場合があります）</>],
                  [<code key="a">email</code>, <><code>email</code> / <code>email_verified</code></>],
                ]}
              />
            </>
          ),
        },
        {
          id: 'verify',
          title: 'ID トークンの検証',
          content: (
            <>
              <p>JWKS で署名（ES256）を検証し、<code>iss</code> と <code>aud</code>（= client ID）と <code>nonce</code> を確かめたうえで、<code>sub</code> を Cairn のユーザー ID として使います。ID トークンの有効期限は5分です。</p>
              <Code>{verifyExample}</Code>
              <Note>token エンドポイントはアクセストークンも返しますが、使えるのは UserInfo（5分で失効）だけです。Cairn のほかの API には使えません。</Note>
            </>
          ),
        },
        {
          id: 'revoke',
          title: '許可の取り消し',
          content: (
            <p>利用者は Cairn の設定の「連携」から、アプリへの許可をいつでも取り消せます。取り消したあとにログインするには、もう一度許可が必要です。</p>
          ),
        },
      ],
    },
    en: {
      title: 'Sign in with Cairn (OIDC)',
      description:
        'OpenID Connect for apps with their own screens outside Cairn (web apps, PWAs, and so on) to identify users as Cairn users. Your app receives only an ID token with the information the user allowed. It cannot be used to read or write Cairn data.',
      sections: [
        {
          id: 'scope',
          title: 'What it can and cannot do',
          content: (
            <>
              <p>
                The ID token&apos;s <code>sub</code> is the user&apos;s Cairn user ID. ID tokens are signed with a key dedicated to Cairn&apos;s OIDC, and cannot be used with the Cairn API, data, files, or Realtime.
              </p>
              <Table
                head={['Goal', 'Mechanism']}
                rows={[
                  ['Know who the user is (sign-in)', 'OIDC on this page (ID token)'],
                  ['Post to channels, send cards, receive interactions', 'Bot token with the Web API and interactions'],
                ]}
              />
              <Note>The ID token contains no workspace membership or role. To admit only members of a specific workspace, check that sub is an active member with the Bot Web API (for example users.info).</Note>
            </>
          ),
        },
        {
          id: 'register',
          title: 'Registering a client',
          content: (
            <p>
              The Cairn operators register clients. Dynamic registration is not supported. Send your app name, a redirect URI for each environment (https, exact match; <code>http://localhost</code> / <code>http://127.0.0.1</code> are also accepted for local development), and whether your app has a server. Apps with a server are registered as confidential clients and receive a client ID and a client secret. Keep the client secret on your server only. Apps that run only in the browser (such as a PWA without a server) cannot keep a secret safe, so they are registered as public clients and receive only a client ID. PKCE (S256) is required for both.
            </p>
          ),
        },
        {
          id: 'flow',
          title: 'Sign-in flow',
          content: (
            <>
              <ol>
                <li>Send an authorization request to <code>https://oss-cairn.com/oidc/authorize</code> with the authorization code flow and PKCE. Request <code>openid</code>, plus only the scopes you need (<code>profile</code> / <code>email</code>).</li>
                <li>Always use <code>state</code>. Generate an unguessable value, store it in the session that starts sign-in, and check it on the callback. If it does not match, do not exchange the code. We also recommend <code>nonce</code>.</li>
                <li>The user allows or denies the request on Cairn&apos;s consent screen. If they already allowed the same scopes, the consent screen is skipped.</li>
                <li>Exchange the code from the callback at the token endpoint to receive the ID token. No refresh token is issued. Send a new authorization request whenever you need the user to sign in with Cairn again (the consent screen is skipped if already allowed).</li>
              </ol>
              <p>Read the endpoints from <code>https://oss-cairn.com/oidc/.well-known/openid-configuration</code>. Do not hard-code them.</p>
              <Table
                head={['Scope', 'Claims in the ID token']}
                rows={[
                  [<code key="a">openid</code>, <><code>sub</code> (the Cairn user ID)</>],
                  [<code key="a">profile</code>, <><code>name</code> (the Cairn account display name, which may differ from the display name in each workspace)</>],
                  [<code key="a">email</code>, <><code>email</code> / <code>email_verified</code></>],
                ]}
              />
            </>
          ),
        },
        {
          id: 'verify',
          title: 'Verifying the ID token',
          content: (
            <>
              <p>Verify the ES256 signature with the JWKS, check <code>iss</code>, <code>aud</code> (your client ID), and <code>nonce</code>, then use <code>sub</code> as the Cairn user ID. ID tokens expire after 5 minutes.</p>
              <Code>{verifyExampleEn}</Code>
              <Note>The token endpoint also returns an access token, but it only works for UserInfo (it expires after 5 minutes). It cannot be used with any other Cairn API.</Note>
            </>
          ),
        },
        {
          id: 'revoke',
          title: 'Revoking access',
          content: (
            <p>Users can revoke an app&apos;s access anytime from Settings, Integrations in Cairn. After revoking, they must allow access again to sign in.</p>
          ),
        },
      ],
    },
  },
}
