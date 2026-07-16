# フロントエンド体感速度の改善施策

- **作成**: 2026-07-12
- **ステータス**: 現行リファレンス（調査済み・実装未着手。実装の進捗に応じて各施策のステータスを更新する）
- **経緯**: SSR 構成の別プロジェクト（バックエンドは地理的に遠いリージョンにあり、条件としては不利なはず）との体感比較で Cairn の方が遅いという報告を受けた調査の結果と、その改善計画

## 1. 背景 — なぜ「不利なはず」の比較対象の方が速く感じるのか

Cairn は Vercel 東京リージョン（`vercel.json` の `hnd1`）+ Supabase 東京で、地理的には最有利の構成。それでも体感で負ける理由は、**リクエスト1本あたりの固定オーバーヘッドの差**にある。

- 比較対象はコンテンツが匿名・全ユーザー共通のため、バックエンドへの fetch がすべて `revalidate: 60` のデータキャッシュに乗る。60 秒間は誰かが訪れるたびに Vercel のキャッシュから返り、ユーザーには完成済み HTML が 1 往復で届く。バックエンドが遠い不利をキャッシュが吸収している
- Cairn はユーザー固有データのため共有キャッシュが原理的に使えず、**素の API 処理性能がそのまま体感になる**。そしてその API 1 本 1 本に、下記の固定費が毎回乗っている

## 2. 現状のボトルネック分析

すべて 2026-07-12 時点のコードに基づく。

### 2.1 認証検証のネットワーク往復が 2 層で毎回発生（最重要）

| 場所 | 内容 | 発生頻度 |
|---|---|---|
| `apps/web/src/middleware.ts` | `supabase.auth.getUser()` — Supabase Auth API への HTTP 往復（ローカルの JWT 検証ではない） | **全ページ遷移**（matcher は `api/` と静的アセットを除く全パス） |
| `apps/web/src/lib/get-auth-context.ts` の `getAuthenticatedUser()` | `supabase.auth.getUser(token)` — 同じく Auth API への HTTP 往復 | **全 API リクエスト** |

1 画面の表示で「middleware 1 回 + API 本数分」の Auth API 往復（1 本あたり目安 30〜150ms）を支払っている。

### 2.2 API ハンドラ本体が動く前の直列往復

`getAuthContext()` は Auth 往復のあと、workspace membership の DB 再照合を**キャッシュがあっても毎回**実行する（非活性化メンバーを即時遮断するための意図的な設計。`docs/user-deactivation-design.md` 参照）。さらに各ルートの `requireWorkspace*` / ロール判定が `active_workspace_members` を**もう一度**照会するケースがある（例: `/api/projects` の GET は `getAuthContext` 直後に guest 判定のため同ビューを再照会）。

結果、ハンドラ本体のクエリが始まる前に **「Auth API → membership DB → ロール DB」の最大 3 直列往復**が発生する。

### 2.3 画面表示 = 多数の API 呼び出しのファンアウト

シェルのマウントだけで `/api/workspaces` `/api/workspaces/list` `/api/projects` `/api/me` などが並列に飛び、各リクエストが個別に 2.1・2.2 の全額を支払う。サーバーレスでは並列リクエストが別インスタンスに割れやすく、コールドスタート + DB 接続確立（`packages/db/src/client.ts` は `max: 1`）も重なる。

### 2.4 初回描画に「中身」がない

`(app)` 配下の全ページが `'use client'` のため、初回表示は「スケルトン → JS ロード → `getSession` → API 群 → 描画」の完全な直列。比較対象の SSR 構成は 1 往復目の HTML に中身がすべて入っている。スケルトンの見せ方の問題ではなく、**中身が届くまでの往復数の差**。

### 2.5 その他（小粒）

- `refetchOnWindowFocus: true`（`query-provider.tsx`）+ `staleTime: 60s` により、タブ復帰時に全クエリが一斉再取得される（表示は古いデータが残るため体感影響は限定的だが、復帰直後の操作がもたつく一因）

## 3. 改善施策（優先度順）

### P1: JWT のローカル検証に切り替える（効果: 最大 / 変更範囲: 小） — ✅ コード実装済み（署名鍵移行は未実施）

- `auth.getUser()`（ネットワーク往復）を `auth.getClaims()` に置き換え、`apps/web/src/lib/auth-jwt.ts` の `verifyAccessToken()` に集約した。対象は `middleware.ts`（全ナビゲーション）と `get-auth-context.ts`（全 API リクエスト）
- JWKS はモジュールレベルにキャッシュ（TTL 10 分）して `getClaims` に渡す。`getClaims` 内蔵の JWKS キャッシュはクライアントインスタンス単位で、リクエストごとに新クライアントを生成する本アプリでは跨がないため
- **後方互換**: `getClaims` は対称鍵（HS256）・JWKS 未設定・WebCrypto 不在を検知して自動で `getUser`（Auth API 往復）にフォールバックする。したがって署名鍵移行前は現状と同挙動・後退なしで、移行後に自動でローカル検証へ切り替わる
- **JWKS の事前取得は非対称鍵と判明した場合のみ行う**: 当初は `verifyAccessToken` が毎回無条件に JWKS 取得を試みていたため、署名鍵移行前（HS256運用中）は「無駄な JWKS 往復 + `getUser` フォールバック」で往復が 2 本に増え、P1 の趣旨（往復を増やさない）に反する状態だった。JWT の header だけをローカルでデコード（署名検証はしない、`alg`/`kid` の確認のみ）して非対称鍵と判明したときだけ JWKS を取得するよう修正し、対称鍵運用中は `getClaims` へのフォールバック 1 本のみに戻した（`decodeJwtHeader` / `needsJwks`、レビュー指摘により修正）
- **残作業（この効果を実際に得るための前提）**: Supabase ダッシュボードで JWT Signing Keys（非対称鍵）へ移行する。**移行するまでは `getUser` フォールバックのままで速度は変わらない**。ローカル検証が効いているかは、移行後に API の TTFB と Auth API へのアウトバウンド呼び出し数で確認する
- 注意点: トークン失効の即時性が access token の TTL（`supabase/config.toml` の `jwt_expiry`、現状 3600 秒）に依存するようになる。非活性化の即時遮断は 2.2 の membership 再照合が引き続き担保するため権限面の後退はない（ログアウト・BAN の反映が最大 TTL 分遅れる点のみ許容判断が必要）

### P2: `getAuthContext` の認可クエリ統合（効果: 大 / 変更範囲: 中） — ✅ 実装済み

- membership 再照合クエリで `role` も同時に取得し、`AuthContext` に `role` を含めて返すようにした（クエリ本数は増やさない）
- 各ルートの二重照会を `ctx.role` 参照に置き換えた:
  - `requireWorkspace{Owner,Admin,Member}(ctx.workspaceId, ctx.userId)`（DB 往復あり）→ `requireRole(ctx.role, min)`（メモリ内判定・DB 往復なし）
  - `getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)` → `ctx.role`
  - `/api/projects` の guest 判定インラインクエリ → `ctx.role === 'guest'`
  - `requireProjectAccess` / `requireChannelAccess` / `canAccessFile` に任意引数 `knownRole` を追加し、呼び出し側が `ctx.role` を渡すと内部の `getWorkspaceRole` を省く（後方互換・未指定なら従来通り DB 解決）
- **セキュリティ要件は維持**: `ctx.role` は毎リクエスト `active_workspace_members` を再照合した結果で、キャッシュされた role を認可に使わない（非活性化の即時遮断は不変）。role の出所は引き続き `active_workspace_members` ビューに限定
- 残す二重照会: `PATCH /api/workspaces/members/[userId]` の**非活性化/再活性化**経路（`handleStatusChange`）だけは呼び出し元の role を別途引く。低頻度の管理操作でありホットパスではないため対象外とした

### P3: 画面初期データの bootstrap 集約（効果: 中 / 変更範囲: 中）

- シェル起動時に必要な `workspace` / `workspace-list` / `me` / `projects` を 1 本の `/api/bootstrap` で一括返却し、TanStack Query の各キャッシュに `setQueryData` で分配する
- リクエスト単位の固定費（P1・P2 適用後も残る分）を 4〜5 回 → 1 回にする
- P1・P2 で固定費自体が下がるため、**効果を再計測してから着手を判断する**

### P4: 小粒の調整（効果: 小 / 随時）

- `refetchOnWindowFocus` の対象を絞る、または `staleTime` との組み合わせを見直す
- サイドバーのリンクに対する prefetch・hover 時の先読み
- Realtime invalidate が短時間に連続したときの再取得バースト間引き

## 4. 計測方法

施策の前後で以下を比較する（体感の議論を数値に落とす）:

- **API の応答時間**: ブラウザ DevTools Network の TTFB。`x-vercel-id` ヘッダで実行リージョン、Vercel ダッシュボードで function duration を確認
- **画面表示までの時間**: ログイン済み状態で `/projects` をリロードし、スケルトン消滅（一覧描画完了）までの時間
- **リクエスト内訳**: `Server-Timing` ヘッダを `getAuthContext` に仕込み、auth 検証 / membership 照会 / 本体クエリの所要時間を分解して記録する（P1・P2 の効果測定に使い、完了後に削除してよい）

## 5. 実施順序

1. Phase 1: P1（JWT ローカル検証）→ 計測 … コード実装済み（署名鍵移行は未実施）
2. Phase 2: P2（認可クエリ統合）→ 計測 … 実装済み
3. Phase 3: 残る差分を見て P3 / P4 の要否を判断
