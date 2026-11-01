# apps/mobile

Expo アプリ。チャット（`app/(app)/chats/`）はネイティブ実装で、それ以外は WebView で Web 版を表示する。設計判断の詳細は [`docs/mobile-app.md`](../../docs/mobile-app.md)。

- **ネイティブの refresh_token を WebView に渡して `setSession()` しない**。rotation が衝突してセッションが失効する。WebView はワンタイムトークンハンドオフで独立したセッションを作る
- **本文・返信の送信は必ずオフラインキューを経由する**（POST より前に AsyncStorage へ保存、クライアント生成 UUID で冪等化）
- ネイティブチャットも Web と同じ private Realtime Broadcast で更新し、ポーリングは使わない
- 共通ヘッダーと通知スライドインは React Native が所有する。WebView モードでは Web の `MobileHeader` を描画しない
- EAS の build profile は同名の EAS Environment に対応づける。ローカル `.env.local` をクラウドビルドや EAS Update に使わない
- チャットを変えるときは Web の `/chats` にも同じ変更が要るか確認する
- 表示言語は Web と同じ `profiles.locale` と i18next のカタログ。タブ、ログイン、ネイティブチャットは `useT()`。設定 WebView の変更は `locale-changed` で追従する。未ログイン時は `['me']` を言語に使わない
- サインアウトと別ユーザーへの入れ替えでは QueryClient を破棄する。query key にユーザー ID は含めず、この境界だけをアカウントの切り替えにする（Web の QueryProvider と同じ）
- アイコンのバッジは `GET /api/notifications/badge-count`（全ワークスペース横断）の値だけで更新する。`useUnreadNotificationCount` はベル用でアクティブワークスペース単位のため使わない。取得失敗で 0 にしない
- 端末キャッシュ（`lib/offline-cache.ts`）はオフライン・取得失敗時の表示専用で、オンライン時の代替値にしない。React Query のデータへ混ぜない（既読化が古いデータで動く）
- `offline_schema_migrations` の版は 1 から増やさない。既存バンドルが起動不能になるため、schema の版は `PRAGMA user_version` で持ち、DB の失敗で起動を止めない
- ジェスチャーは Gesture Handler + Reanimated で書き、`PanResponder` を新規に使わない。`Modal` の中にも `GestureHandlerRootView` を置く（Android で反応しなくなる）
- クイックアクションは動的登録（`setItems`）だけで作る。静的定義は動的項目と並んで重複する。Android の宛先は有効な起動口（`patches/expo-quick-actions@6.0.2.patch`）で、MainActivity に固定すると別アイコン中に起動できない
- アプリだけの機能・導線を変えたときも、`/ai` のプロダクトヘルプ（`apps/web/src/lib/ai/product-help.ts`）の更新が要るか確認する
- Android の Intent を増やすときは `android.intentFilters` に書く。plugin が足す filter は `MainActivity` だけに付き、別アイコン中は受けられない
- `getResolvedSharedPayloadsAsync` は共有がファイルのときだけ呼ぶ（URL をネイティブが取得しに行く）。`expo-sharing` を上げるときは `patches/` の path traversal 修正が upstream に入ったか確認する
