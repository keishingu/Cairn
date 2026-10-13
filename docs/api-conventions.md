# API ルート実装規約

> **ステータス**: 現行リファレンス（実装に追従して更新する）

## 認証

認証は常に必須。`DATABASE_URL` と Supabase の設定が必要。未認証は `/auth/login` へリダイレクト。

### API ルートでのユーザー取得

新しい API ルートを作るときは、必ず `getAuthContext()` を使ってユーザー ID とワークスペース ID を取得する。`DEV_*` のハードコード ID は書かない。

```ts
import { getAuthContext } from '@/lib/get-auth-context'

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error  // 未認証なら 401 を返す

  // ctx.userId, ctx.workspaceId が使える
}
```

`getAuthContext()` は `Authorization: Bearer <token>` ヘッダーを優先し、なければ Cookie にフォールバックする。

---

## サインアップフロー

1. `/auth/signup` でメール・パスワード・表示名を入力
2. Supabase Auth でユーザー作成（`auth.users`）。メール確認が必要な設定の場合は `/auth/verify-email` へ
3. `/api/auth/setup` を呼び出し、`profiles` テーブルへのプロフィール作成を行う（ワークスペースはここでは作らない）
4. 招待経由なら `/invite/[token]` へ、通常は `/onboarding` へリダイレクト。オンボーディングで最初のワークスペースを作成する（`/api/auth/setup` に `workspaceName` を渡す）

---

## 権限

方針は [`AGENTS.md`](../AGENTS.md)「権限モデル」。補足:

- プロジェクトロールの表示名・色・並び順はワークスペース単位の `project_roles` が共有元。初期値は「リーダー」「サブリーダー」「メンバー」で、`legacy_role = 'member'` の行を新規参加時のデフォルトとする
- `project_members.role` はローリングデプロイ互換用に残している。新コードは `role_id` を優先する
- 403 のメッセージ例: 「この操作には管理者以上の権限が必要です」

---

## API サーバーの分離

Web も Expo も Next.js Route Handlers を共有する。Hono などへの API 分離は、Next.js から独立したスケール・デプロイ分離が必要になった時点で改めて検討する。

## ファイルメタデータの部分更新

`files.metadata` は確定資料（`isLatest`・`latestChangeNotes`）、インデックス状態、関連チャンネル、サムネイルが共有するJSONB。インデックス生成や認可確認の前に読んだ値を丸ごと書き戻すと、その間の変更が消失する。部分変更は `jsonb_set` / JSONB結合 / キー削除など、更新時点の列値を参照するSQL式で行う。配列への追加も現在の配列をDBで読み、既存要素を保持する。

確定資料の差し替えはプロジェクトとファイルを `FOR UPDATE` でロックし、そのトランザクション内で読んだ変更履歴を引き継ぐ。ロック外の更新側も対象キーだけを変更する必要がある。

回帰テストは `apps/web/src/lib/inngest/functions.metadata.test.ts`。PGliteでPostgreSQLのJSONB式と実際のAPIを実行し、`embedMany` を保留して差し替えを先に完了させる。外部API・本番DBへの接続は不要。
