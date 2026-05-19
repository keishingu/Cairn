# 技術要件定義書

---

## 1. 技術方針

- TypeScriptでフロントエンド・バックエンドを統一
- MVPではNext.js中心で実装
- Hono APIはPhase 2以降に切り出す
- PostgreSQLを中心としたデータモデル
- AI / RAGを標準機能として組み込む
- Slack / Teams / Google Calendar / Outlook との連携を前提とする
- DDD / クリーンアーキテクチャを軽量に採用
- CQRSをコード構造として軽量に採用

---

## 2. 技術スタック

### Web

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zustand
- React Hook Form
- next-themes
- nuqs

### Mobile

- Expo
- React Native
- TypeScript
- Expo Push Notifications

### Backend

MVPではNext.js Route Handlers / Server Actionsを採用。

Phase 2以降でHono APIを追加する。

- Next.js Route Handlers
- Server Actions
- Hono（将来）
- Zod

### Database

- Supabase PostgreSQL
- Drizzle ORM
- pgvector

### Auth / Realtime / Storage

- Supabase Auth
- Supabase Realtime
- Supabase Storage

### AI

- Vercel AI SDK
- OpenAI API

### 非同期ジョブ

- Inngest

### Monorepo

- pnpm Workspace
- Turborepo

---

## 3. 初期リポジトリ構成

```txt
cairn/
  apps/
    web/

  packages/
    db/
    shared/
    core/
    config/
```

---

## 4. 将来追加構成

```txt
cairn/
  apps/
    web/
    api/
    mobile/

  packages/
    db/
    shared/
    core/
    ai/
    integrations/
    config/
```

---

## 5. Hono API方針

MVPではHono APIを分離しない。

理由:

- Web版MVP完成を優先する
- Next.js Route Handlers / Server Actionsで十分に始められる
- APIサーバー分離は設計・認証・デプロイ・CORSなどの考慮が増える
- ExpoアプリはPhase 2以降のため、初期から共通APIを切る必要性は低い

ただし、将来的にHonoへ切り出せるよう、業務ロジックはpackages/coreに寄せる。

---

## 6. DDD / クリーンアーキテクチャ方針

MVP段階では過度に抽象化せず、軽量に採用する。

### 目的

- 業務ロジックをUI・DBから分離する
- Hono API / Expo / Workerへ切り出しやすくする
- FDEによる業務整理の成果をドメインモデルに反映しやすくする

### レイヤー

```txt
presentation
  ↓
application
  ↓
domain

infrastructure
  ↓
ports
```

### packages/core

```txt
packages/core/
  src/
    domain/
    application/
    ports/
```

### domain

- Project
- Workspace
- Message
- Task
- GalleryItem
- AiAgent
- ProjectStatus
- ProjectMember

### application

- CreateProjectUseCase
- UpdateProjectStatusUseCase
- PostMessageUseCase
- UploadGalleryItemUseCase
- GenerateAiReplyUseCase

### ports

- ProjectRepository
- MessageRepository
- FileStorage
- AiClient
- NotificationService
- CalendarIntegration
- ChatIntegration

---

## 7. CQRS方針

CQRSをコード構造として軽量に採用する。

### Command

状態を変更する処理。

例:

- CreateProjectCommand
- UpdateProjectStatusCommand
- PostMessageCommand
- UploadFileCommand
- UploadGalleryItemCommand
- CreateTaskCommand
- ConnectSlackCommand
- SyncGoogleCalendarCommand

### Query

画面表示や検索のためにデータを取得する処理。

例:

- GetProjectDetailQuery
- ListProjectsQuery
- GetCalendarEventsQuery
- GetKanbanBoardQuery
- GetProjectChatQuery
- GetGalleryItemsQuery
- SearchFilesQuery

### DB方針

MVPではWrite DB / Read DBを分離しない。

```txt
Write DB = PostgreSQL
Read DB  = PostgreSQL
```

Event SourcingはMVPでは採用しない。

---

## 8. 状態管理方針

Reduxは採用しない。

### 採用

- TanStack Query
- Zustand
- React標準状態管理
- React Hook Form
- next-themes
- nuqs

### 使い分け

- サーバー状態: TanStack Query
- URL状態: Next.js searchParams / nuqs
- フォーム状態: React Hook Form
- 軽いUI状態: useState / useReducer
- グローバルUI状態: Zustand
- テーマ状態: next-themes
- リアルタイム状態: Supabase Realtime + TanStack Query更新

---

## 9. Mobile / Expo方針

チャット・Push通知・写真アップロードが重要なため、最終的にはExpoでモバイルアプリを提供する。

### Mobileで重視する機能

- Push通知
- チャット
- メンション通知
- 写真アップロード
- ギャラリー閲覧
- プロジェクト詳細確認

UIはWebと完全共通化しない。

共通化する対象は以下に限定する。

- 型
- Zod schema
- API型
- 権限定義
- 定数
- domain logic
