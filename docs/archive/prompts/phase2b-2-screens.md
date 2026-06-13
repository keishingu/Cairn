# Phase 2-B Session 2: 主要画面4本

## タスク

プロジェクト一覧・チャット・タスク・通知の4画面を実装する。

## 前提条件

Session 1 が完了済み（`apps/mobile/` 新設、ログイン・サインアップ動作、`apiFetch()` 実装済み）。

## 参照ドキュメント

- `CLAUDE.md` — リポジトリ全体の規約・方針（**必ず読む**）
- `docs/08_expo_roadmap.md` — ナビゲーション対応表・画面構成
- `apps/web/src/app/api/` — 呼び出す API エンドポイント群（実際の実装を参照して型を確認する）
- `packages/shared/src/` — 共有型定義

---

## スタイリング方針

**React Native `StyleSheet` のみ使う。NativeWind は使わない。**
Web の CSS 変数・Tailwind クラスは参照しない。

---

## 作業 1: ボトムタブナビゲーション（`app/(app)/_layout.tsx`）

`expo-router` の `<Tabs>` コンポーネントで5タブを設定する。

| タブ | ルート | アイコン（`@expo/vector-icons/Ionicons`） |
|---|---|---|
| プロジェクト | `projects/` | `folder-outline` |
| チャット | `chats/` | `chatbubbles-outline` |
| タスク | `tasks/` | `checkmark-circle-outline` |
| 通知 | `notifications/` | `notifications-outline` |
| メニュー | `menu/` | `menu-outline` |

---

## 作業 2: プロジェクト一覧（`app/(app)/projects/index.tsx`）

- `GET /api/projects` を TanStack Query で取得（`queryKey: ['projects']`）
- カード形式でリスト表示（プロジェクト名・ステータス・メンバー数）
- タップで `projects/[id]` へ遷移

---

## 作業 3: プロジェクト詳細 + チャット（`app/(app)/projects/[id].tsx`）

- `GET /api/projects/:id` でプロジェクト情報取得
- `GET /api/projects/channels?projectId=:id` でプロジェクトに紐づくチャンネルID取得
- `GET /api/channels/:channelId/messages` でメッセージ取得（`refetchInterval: 5000` でポーリング）
  - Supabase Realtime への移行は Phase 3 以降
- `POST /api/channels/:channelId/messages` でメッセージ送信
- `POST /api/channels/:channelId/read` で既読更新（送信時・画面フォーカス時）
- メッセージ本文中の `<@userId|displayName>` は `@displayName` に変換して表示する

---

## 作業 4: タスク一覧（`app/(app)/tasks/index.tsx`）

- `GET /api/tasks` を TanStack Query で取得（`queryKey: ['tasks']`）
- タスク名・ステータス・期日をリスト表示
- ステータス変更は `PATCH /api/tasks/:id`

---

## 作業 5: 通知一覧（`app/(app)/notifications/index.tsx`）

- `GET /api/notifications` を TanStack Query で取得（`queryKey: ['notifications']`）
- 未読（`readAt` が null）は強調表示
- タップで `PATCH /api/notifications` を呼んで既読化

---

## API エンドポイント一覧

| 操作 | メソッド | エンドポイント |
|---|---|---|
| プロジェクト一覧 | GET | `/api/projects` |
| プロジェクト詳細 | GET | `/api/projects/:id` |
| プロジェクトのチャンネル | GET | `/api/projects/channels?projectId=:id` |
| メッセージ一覧 | GET | `/api/channels/:id/messages` |
| メッセージ送信 | POST | `/api/channels/:id/messages` |
| 既読更新 | POST | `/api/channels/:id/read` |
| タスク一覧 | GET | `/api/tasks` |
| タスク更新 | PATCH | `/api/tasks/:id` |
| 通知一覧 | GET | `/api/notifications` |
| 通知既読化 | PATCH | `/api/notifications` |

---

## カスタムフック（`hooks/` に切り出す）

画面コンポーネントを薄く保つため、データフェッチと mutation はカスタムフックに分離する。

- `hooks/use-projects.ts`
- `hooks/use-messages.ts`（`channelId` を引数に取る）
- `hooks/use-tasks.ts`
- `hooks/use-notifications.ts`

---

## 完了の定義

- `pnpm typecheck` が全パッケージで通ること
- Expo Go でプロジェクト一覧 → タップ → チャット → メッセージ送信ができること
- ポーリングで他端末からの発言が5秒以内に反映されること
