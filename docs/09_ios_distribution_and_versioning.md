# iOS 配布戦略とバージョン互換性

---

## 1. iOS 配布方式の結論

### ホスティング版（Cairn Cloud）

App Store で公開する。

### セルフホスト版（企業・OSS）

**App Store の同一アプリを使い、サーバー URL を設定可能にする**。

Mattermost / Rocket.Chat 等の OSS が採用しているパターン。起動時にサーバー URL を入力させることで、1 本のアプリで複数の接続先に対応する。

```
App Store に 1 本のアプリを公開
  ↓
起動時にサーバー URL を入力

- ホスティング版ユーザー → https://cairn.app
- 企業版ユーザー        → https://cairn.your-company.com
```

**メリット**:
- アプリは 1 本で管理が楽
- 企業側に Apple Developer Program 不要
- App Store 審査も 1 回

### Enterprise Distribution を採用しない理由

Apple Developer Enterprise Program ($299/年) は社外ユーザーへの配布が規約違反。証明書失効リスクがある（Facebook・Google も過去に一時失効した実績あり）。

---

## 2. TestFlight での限定配布（開発・ベータ期間）

App Store リリース前の限定公開には TestFlight を使う。

| | 内部テスター | 外部テスター |
|---|---|---|
| 人数上限 | 100 人 | 10,000 人 |
| Apple 審査 | **なし**（即日） | 初回のみ |
| 招待方法 | メール個別招待 | 公開リンク or メール |

テスター側は Apple Developer Program への加入不要。Apple ID だけあれば参加できる。

---

## 3. バージョン互換性設計

### 問題

- Expo アプリは App Store 経由で更新される（Cairn 側が管理）
- セルフホスト版サーバーは企業が管理するため、更新が遅れることがある
- チャット以外は WebView で Web を表示するため、互換性の問題が起きやすいのはチャット画面（ネイティブ実装）に限られる

### `/api/version` エンドポイント

認証不要の公開エンドポイント。Expo アプリが起動時に呼び出してサーバーとの互換性を確認する。

```
GET /api/version

{
  "server_version": "1.2.0",
  "min_supported_app_version": "1.0.0",
  "features": {
    "native_chat": true
  }
}
```

### アプリ起動時の互換性チェックフロー

```
Expo アプリ起動
  ↓
GET /api/version
  ↓
app_version < min_supported_app_version
  → 「アップデートが必要です」画面を表示（App Store へ誘導）

server が機能フラグを false で返している
  → その機能の UI を非表示にする（グレースフルデグラデーション）
```

### 互換性ポリシー

- **N-1 サポート**: 1 世代前のサーバーとの互換は保証する
- **サポート期限を明示**: リリースノートに期限を記載する
- **セルフホスト企業への責任**: ドキュメントに互換性ポリシーを明示し、古いバージョンを使い続ける場合は自己責任とする

### 環境変数

| 変数 | 説明 | デフォルト |
|---|---|---|
| `APP_VERSION` | サーバーのバージョン | `0.1.0` |
| `MIN_APP_VERSION` | サポートする最小アプリバージョン | `0.1.0` |

---

## 4. EAS Build によるビルド・配布

```bash
# EAS CLI セットアップ（初回）
npm install -g eas-cli
eas login
eas build:configure

# iOS ビルド
eas build --platform ios

# TestFlight / App Store Connect にアップロード
eas submit --platform ios
```

詳細な Expo 構成は `docs/08_expo_roadmap.md` を参照。
