# apps/mobile

Expo アプリ。チャット（`app/(app)/chats/`）はネイティブ実装で、それ以外は WebView で Web 版を表示する。設計判断の詳細は [`docs/mobile-app.md`](../../docs/mobile-app.md)。

- **ネイティブの refresh_token を WebView に渡して `setSession()` しない**。rotation が衝突してセッションが失効する。WebView はワンタイムトークンハンドオフで独立したセッションを作る
- **本文・返信の送信は必ずオフラインキューを経由する**（POST より前に AsyncStorage へ保存、クライアント生成 UUID で冪等化）
- ネイティブチャットも Web と同じ private Realtime Broadcast で更新し、ポーリングは使わない
- 共通ヘッダーと通知スライドインは React Native が所有する。WebView モードでは Web の `MobileHeader` を描画しない
- EAS の build profile は同名の EAS Environment に対応づける。ローカル `.env.local` をクラウドビルドや EAS Update に使わない
- チャットを変えるときは Web の `/chats` にも同じ変更が要るか確認する
- アプリだけの機能・導線を変えたときも、`/ai` のプロダクトヘルプ（`apps/web/src/lib/ai/product-help.ts`）の更新が要るか確認する
