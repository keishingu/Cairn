# フロントエンド体感速度の改善（残作業）

> **ステータス**: 残作業のみ。実装済みの施策（JWT ローカル検証のコード、`getAuthContext` の role 同時取得、hover prefetch、フォーカス復帰ウォームアップ `/api/warmup`）の経緯は Git 履歴を参照。

Cairn はユーザー固有データのため共有キャッシュが効かず、API 1 本ごとの固定費（Auth 検証 → membership 照合 → 本体クエリ）と、`(app)` 配下が全て `'use client'` による「JS ロード → `getSession` → API 群 → 描画」の直列がそのまま体感になる。

## 残作業

- **JWT Signing Keys（非対称鍵）への移行（Supabase ダッシュボード）**: `lib/auth-jwt.ts` の `verifyAccessToken()` は `getClaims()` でローカル検証するが、対称鍵（HS256）運用中は自動で `getUser()`（Auth API 往復）にフォールバックするため、**移行するまで速度は変わらない**。移行後に API の TTFB と Auth API へのアウトバウンド数で効果を確認する。移行後はトークン失効（ログアウト・BAN）の反映が access token の TTL（`supabase/config.toml` の `jwt_expiry`）分遅れる。非活性化の即時遮断は membership 再照合が担保する
- **P3: bootstrap 集約**: シェル起動時の `/api/workspaces` `/api/workspaces/list` `/api/me` `/api/projects` を 1 本の `/api/bootstrap` にまとめ、`setQueryData` で各キャッシュへ分配する。署名鍵移行後に固定費を再計測してから着手を判断する
- **P4: 小粒の調整**
  - `refetchOnWindowFocus: true` + `staleTime: 60s`（`components/query-provider.tsx`）でタブ復帰時に全クエリが一斉再取得される。対象を絞るか組み合わせを見直す（Realtime の取りこぼし回収にも使っているため、外す場合は [`notification-design.md`](notification-design.md#realtime-配信) と整合させる）
  - Realtime invalidate が短時間に連続したときの再取得バーストの間引き

不採用: 定期 keep-warm ping（サーバーレスはインスタンスが割れやすく、1 本では全体を温められない）。

## 計測方法

- **API**: DevTools Network の TTFB、`x-vercel-id` で実行リージョン、Vercel ダッシュボードの function duration
- **画面**: ログイン済みで `/projects` をリロードし、スケルトン消滅までの時間
- **内訳**: 必要に応じ `getAuthContext` に一時的に `Server-Timing` を入れ、auth 検証 / membership 照会 / 本体クエリを分解する
