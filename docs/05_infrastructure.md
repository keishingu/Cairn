# インフラ要件定義書

> **ステータス**: 設計時スナップショット（作成: 2026-05-22）
> 設計フェーズの記録であり、その後の実装状況は反映していない。矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。

---

## 1. 基本方針

初期段階では、少人数で高速に開発・運用できる構成を採用する。

- サーバーレス中心
- マネージドサービス活用
- 低コスト
- 将来的なスケールに対応可能

---

## 2. 採用インフラ

### Webアプリケーション

- Vercel

### API

- Next.js Route Handlers / Server Actions（初期）
- Vercel Functions
- Google Cloud Run（将来的に移行可能）

### データベース

- Supabase PostgreSQL

### 認証

- Supabase Auth

### リアルタイム通信

- Supabase Realtime

### ストレージ

- Supabase Storage

### ベクトル検索

- pgvector

### モバイルアプリ

- Expo EAS Build

### Push通知

- Expo Push Notifications

### AI

- OpenAI API

### 非同期ジョブ

- Inngest

### CI/CD

- GitHub Actions

---

## 3. インフラ構成図

```txt
Web Browser
    │
    ▼
Vercel (Next.js)
    │
    ├── Route Handlers / Server Actions
    ├── OpenAI API
    └── Inngest
            │
            ▼
       Supabase
       ├─ PostgreSQL
       ├─ Auth
       ├─ Realtime
       ├─ Storage
       └─ pgvector

Mobile App (Expo)
    │
    ▼
Vercel API / Supabase

Slack / Teams
Google Calendar / Outlook
```

---

## 4. 環境構成

### Development

- ローカル開発環境
- Supabase Local（任意）

### Staging

- Vercel Preview Environment
- Supabase Staging

### Production

- Vercel Production
- Supabase Production

---

## 5. スケール戦略

### MVP

```txt
Vercel + Supabase
```

### 中規模

```txt
Vercel + Supabase + Inngest
```

### 大規模

```txt
Vercel + Cloud Run + Supabase
```

---

## 6. Cloud Run移行対象

以下の処理が増加した場合に移行を検討する。

- PDF解析
- OCR
- Embedding生成
- AI長時間処理
- Slack / Teams同期
- Google Calendar / Outlook同期
- Push通知大量配信

---

## 7. 監視

- Vercel Analytics
- Supabase Monitoring
- Sentry

---

## 8. セキュリティ

- HTTPS
- Row Level Security
- OAuth 2.0
- JWT認証
- Secrets管理

---

## 9. 外部サービス接続

### OpenAI API

- AIチャット
- Embedding生成

### Slack API

- 通知
- 双方向同期（将来）

### Microsoft Graph API

- Teams
- Outlook Calendar

### Google Calendar API

- カレンダー同期

---

## 10. 想定月額コスト

### MVP

- 0〜3,000円 / 月

### 小規模運用

- 5,000〜15,000円 / 月

### 成長フェーズ

- 15,000〜50,000円 / 月

---

## 11. 障害対応方針

外部サービス障害時も、コア機能は継続利用可能とする。

### 継続利用可能

- プロジェクト管理
- チャット
- ファイル閲覧
- ギャラリー閲覧

### 一時的に影響を受ける機能

- AI
- Push通知
- Slack / Teams連携
- Calendar連携
