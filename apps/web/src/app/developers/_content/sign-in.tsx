// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { Code, Note, Table, type DocPage } from '../_components/doc'

const verifyExample = `
import { createRemoteJWKSet, jwtVerify } from 'jose'

// issuer はクライアント登録時にお知らせする URL（末尾は /auth/v1）
const issuer = process.env.CAIRN_OIDC_ISSUER
const jwks = createRemoteJWKSet(new URL(\`\${issuer}/.well-known/jwks.json\`))

const { payload } = await jwtVerify(idToken, jwks, {
  issuer,
  audience: process.env.CAIRN_OIDC_CLIENT_ID,
})
const cairnUserId = payload.sub
`

const verifyExampleEn = verifyExample.replace(
  '// issuer はクライアント登録時にお知らせする URL（末尾は /auth/v1）',
  '// The issuer URL is shared when your client is registered (it ends with /auth/v1)',
)

export const signInPage: DocPage = {
  slug: 'sign-in',
  content: {
    ja: {
      title: 'Cairn でログイン（OIDC）',
      description:
        'Cairn の外に画面を持つアプリ（Web アプリ・PWA など）が、利用者を Cairn のユーザーとして識別するための OpenID Connect の仕様です。分かるのは「誰か」だけで、Cairn のデータの読み書きには使えません。',
      sections: [
        {
          id: 'scope',
          title: 'できること・できないこと',
          content: (
            <>
              <p>
                ID トークンの <code>sub</code> で、利用者の Cairn のユーザー ID が分かります。アクセストークンも発行されますが、Cairn の API・データ・ファイル・Realtime には使えません（すべて拒否されます）。保存せずに捨ててください。
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
              クライアントは Cairn の運営者が登録します（動的登録には対応していません）。アプリの名前、環境ごとのリダイレクト URI（https、完全一致）、サーバーを持つかどうかをお知らせください。サーバーを持つアプリは機密クライアントとして client ID・client secret・issuer の URL をお渡しします。client secret はサーバーだけに置いてください。ブラウザーだけで動くアプリ（サーバーを持たない PWA など）は、secret を安全に置けないため公開クライアントとして登録し、client ID と issuer の URL だけをお渡しします。どちらも PKCE は必須です。
            </p>
          ),
        },
        {
          id: 'flow',
          title: 'ログインの流れ',
          content: (
            <>
              <ol>
                <li>認可コード + PKCE で認可リクエストを送ります。スコープは <code>openid</code> を基本に、必要なものだけ（<code>profile</code> / <code>email</code>）を足してください。</li>
                <li><code>state</code> を必ず使います。推測できない値を作ってログイン開始時のセッションに保存し、コールバックで一致を確かめてください。一致しなければコードを交換しないでください。</li>
                <li>利用者は Cairn の同意画面で許可・拒否します。以前に同じスコープで許可していれば、同意画面は出ません。</li>
                <li>コールバックで受け取ったコードを token エンドポイントで交換し、ID トークンを受け取ります。</li>
              </ol>
              <p>エンドポイントは <code>{'{issuer}/.well-known/openid-configuration'}</code> から読んでください。直書きしないでください。</p>
            </>
          ),
        },
        {
          id: 'verify',
          title: 'ID トークンの検証',
          content: (
            <>
              <p>JWKS で署名を検証し、<code>iss</code> と <code>aud</code>（= client ID）を確かめたうえで、<code>sub</code> を Cairn のユーザー ID として使います。</p>
              <Code>{verifyExample}</Code>
              <p>
                <code>name</code> / <code>picture</code> は Cairn のアカウント情報で、ワークスペースごとの表示名・アイコンとは異なる場合があります。ワークスペースでの表示名は Bot の Web API から取ってください。
              </p>
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
        'OpenID Connect for apps with their own screens outside Cairn (web apps, PWAs, and so on) to identify users as Cairn users. It tells you who the user is, and nothing more. It cannot be used to read or write Cairn data.',
      sections: [
        {
          id: 'scope',
          title: 'What it can and cannot do',
          content: (
            <>
              <p>
                The ID token&apos;s <code>sub</code> is the user&apos;s Cairn user ID. An access token is also issued, but Cairn rejects it everywhere: the API, data, files, and Realtime. Discard it without storing it.
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
              The Cairn operators register clients. Dynamic registration is not supported. Send your app name, a redirect URI for each environment (https, exact match), and whether your app has a server. Apps with a server are registered as confidential clients and receive a client ID, a client secret, and the issuer URL. Keep the client secret on your server only. Apps that run only in the browser (such as a PWA without a server) cannot keep a secret safe, so they are registered as public clients and receive only a client ID and the issuer URL. PKCE is required for both.
            </p>
          ),
        },
        {
          id: 'flow',
          title: 'Sign-in flow',
          content: (
            <>
              <ol>
                <li>Send an authorization request with the authorization code flow and PKCE. Request <code>openid</code>, plus only the scopes you need (<code>profile</code> / <code>email</code>).</li>
                <li>Always use <code>state</code>. Generate an unguessable value, store it in the session that starts sign-in, and check it on the callback. If it does not match, do not exchange the code.</li>
                <li>The user allows or denies the request on Cairn&apos;s consent screen. If they already allowed the same scopes, the consent screen is skipped.</li>
                <li>Exchange the code from the callback at the token endpoint to receive the ID token.</li>
              </ol>
              <p>Read the endpoints from <code>{'{issuer}/.well-known/openid-configuration'}</code>. Do not hard-code them.</p>
            </>
          ),
        },
        {
          id: 'verify',
          title: 'Verifying the ID token',
          content: (
            <>
              <p>Verify the signature with the JWKS, check <code>iss</code> and <code>aud</code> (your client ID), then use <code>sub</code> as the Cairn user ID.</p>
              <Code>{verifyExampleEn}</Code>
              <p>
                <code>name</code> / <code>picture</code> come from the Cairn account and may differ from the display name and icon in each workspace. Get the workspace display name from the Bot Web API.
              </p>
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
