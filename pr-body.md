## What Problem This Solves
- `permissions.ts` の認可分岐に回帰テストがなく、guest 越境や DM / 添付ファイル周りの退行を検知しづらい状態でした。

## Why This Change Was Made
- `permissions.test.ts` を追加し、workspace role 判定の閾値を固定しました。
- `requireProjectAccess` / `requireChannelAccess` の 403 条件を、issue で挙がっていた guest 越境・DM 非メンバー・別 workspace channel のケースで固定しました。
- `canAccessFile` の重要分岐を、別 workspace・アップロード者本人・guest の参加外 project・添付経由アクセスで検証するようにしました。

## User Impact
- 今後 `permissions.ts` を変更しても、主要な認可退行を test で早めに検知しやすくなります。

## Evidence
- `pnpm --dir /tmp/cairn-issue-333 --filter @cairn/web test -- src/lib/permissions.test.ts`

Fixes keishingu/Cairn#333
