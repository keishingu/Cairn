# user-docs

ユーザーに見せることを想定したドキュメントを置くディレクトリ。

## docs/ との使い分け

- `user-docs/`: ユーザー向けの機能説明・仕様確認用ドキュメント
- `docs/`: 開発者 / AI エージェント向けの設計・実装・運用ドキュメント

既存の `docs/` はコードや `CLAUDE.md` から参照されているため、当面は移動せずそのまま使う。

## 自動生成ドキュメント

- [`test-spec.md`](./test-spec.md): テストコードから自動生成する、確認済みの振る舞い一覧

`test-spec.md` は直接編集せず、テストを更新してから次のコマンドで再生成する。

```bash
pnpm gen:test-spec
```

pnpm が使えない環境では、次でも同じ生成処理を実行できる。

```bash
node scripts/gen-test-spec.mjs
```
