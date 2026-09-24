# フロントエンドコンポーネント設計ガイドライン

> **ステータス**: 現行リファレンス（実装に追従して更新する）

## コンポーネントの3層構造

page → organism/container（省略可）→ molecule/atom の3層を原則とする。

### Cairn のディレクトリとの対応

| 層 | ディレクトリ例 | 役割 |
|---|---|---|
| page | `components/app/pages/*.tsx` | 画面の構成、Domain Hook の呼び出し、イベントとデータの受け渡し |
| organism/container | `components/app/detail-panel/tabs/*.tsx` など | 必要な場合に機能単位をまとめ、Domain Hook 経由のデータとイベントを表示コンポーネントへ渡す |
| molecule/atom（表示） | `components/app/primitives.tsx` など | props を受けて表示する。入力・開閉などの UI 状態は持てるが、API 通信や query を持たない |

層はファイルの配置だけでなく責務で判断する。同じ `components/` 配下でも、container と表示コンポーネントには異なるルールが適用される。

### ページ層の責務

- 子コンポーネントを組み合わせ、画面のレイアウトとデータ・イベントの受け渡しを担う
- 子を配置する JSX やレイアウト用のラッパーは書ける。フォーム・一覧行など機能固有の表示をページ内に抱え込まず、表示コンポーネントへ分ける
- API 通信・キャッシュ操作はページ固有でも Domain Hook に切り出す。日付計算など React に依存しない処理は純粋関数にし、Hook 化だけを目的としたラッパーは作らない

### 表示コンポーネントのルール

- API 通信・query・mutation は持たせず、データと操作コールバックを props で受ける。入力・開閉状態やフォーカス制御など表示に閉じた処理は持てる
- 外側の余白や画面内での配置・幅は親が決める。ボタン高・アイコンサイズ・内側の余白など部品固有の寸法は [UI 統一ルール](../.interface-design/system.md) に従う。固定値を避けるためだけに寸法ごとの props を増やさない
- 共通の表示部品を組み合わせてよい。表示部品から page やデータ取得用 container に依存させない

---

## Domain Hook パターン

page・container を含め、コンポーネント内で直接 `useQuery` / `useMutation` / `fetchWithAuth` 等による API 通信を記述せず、必ず Domain Hook にカプセル化する。単一画面専用でもこの方針を適用する。

### 配置と命名

- 場所: `apps/web/src/hooks/`
- 命名: `use-{resource}-{action}.ts`

以下のパス例は Web 向け。Expo でも通信・購読と表示を分ける責務は共通とし、ネイティブ固有の状態管理は `apps/mobile/hooks/` などアプリ側に置く。

```
hooks/
  use-patch-project.ts       # プロジェクトの更新・削除
  use-project-statuses.ts    # ステータス一覧
  use-project-tasks.ts       # タスク一覧・トグル・作成
  use-project-files.ts       # ファイル一覧・削除
  use-project-members.ts     # メンバー一覧・追加・削除
  use-project-milestones.ts  # マイルストーン一覧・作成・更新・削除
```

### フックが担うこと

- `fetchWithAuth` を使った API リクエスト
- ローディング・エラー状態の管理
- キャッシュ操作（楽観的更新・invalidation）

### page / container が担うこと

- フックの呼び出し
- UIステート（モーダルの開閉・選択状態など）
- `mutate()` の第2引数を使ったUI側コールバック

例えば [`overview-tab.tsx`](../apps/web/src/components/app/detail-panel/tabs/overview-tab.tsx) の `MilestoneSection` は `useProjectMilestones` を呼び、`MilestoneRow` に値と操作を渡す。表示側の行は API を知らなくてよい。既存 Hook・表示部品を先に探し、単に props を中継するだけの container は追加しない。

```ts
// ✅ Good
const { data: tasks, toggleMutation } = useProjectTasks(project.id)
toggleMutation.mutate(
  { id, newStatus },
  { onSuccess: () => setShowModal(false) },
)

// ❌ Bad — コンポーネント内に useQuery を直書き
const { data } = useQuery({
  queryKey: ['tasks'],
  queryFn: () => fetchWithAuth(`/api/tasks?projectId=${id}`).then(r => r.json()),
})
```

---

## 既存実装への適用

本書は新規実装・改修時の規約で、全画面の適合は保証しない。既存ページに直接 query が残っていても規約の例外とはしない（移行は GitHub Issue で追う）。

改修では既存の Hook や [`TaskFormFields`](../apps/web/src/components/app/task-form-fields.tsx) などを再利用する。3層すべてを必須にするための中継コンポーネントや、個別フォームの共通化だけを目的とした汎用フォーム基盤は追加しない。

---

## イベント命名

- ハンドラ関数名には `handle` プレフィックス（`handleClick`、`handleSubmit`、`handleChange`）
- イベントハンドラを受け取る props には `on` プレフィックス（`onClick`、`onClose`、`onChangeStatus`）

---

## 保存方式（インライン編集 / フォーム）

保存 UI が画面ごとにバラバラだと「変更がいつ確定するか」をユーザーが予測できないため、次の方針で統一する。

- **インライン編集はフォーカスが外れた時点で自動保存する（blur 自動保存）。確定ボタンは置かない**
  - 既存値をその場で表示し、クリック → 入力 → blur で確定する形（例: `detail-panel/tabs/overview-tab.tsx` の `InlineText`）
  - 値が変わっていなければ保存リクエストは送らない（no-op をガードする）
  - 必須項目が空のまま blur した場合は元の値へ戻す
  - 日付レンジのように入力欄が複数ある場合は、ペア全体からフォーカスが外れた時だけ確定する（`relatedTarget` がラッパー内に残っているうちは確定しない）。`Escape` で取り消し
  - ドロップダウン選択（ステータス等）は項目を選んだ時点で即保存する
- **フォーム（モーダル・設定画面など、複数項目をまとめて編集する文脈）は明示的な保存ボタンで確定する**
  - 設定画面の各行・作成モーダルなどが該当
- **ボタンのラベルは「保存」「キャンセル」に統一する**（「確定」「取消」「更新」「適用」などを混在させない）
  - 進行中・完了の表現は「保存中…」「保存済み」
  - 新規作成の主アクションのみ「作成」「追加」を使う（更新ではなく作成のため）
  - チャットメッセージ編集は慣習どおり明示保存（`Enter` 保存 / `Esc` キャンセル）だが、ラベルは同じく「保存」「キャンセル」

### 一過性フィードバック（トースト）

削除・保存などの「成功/失敗」を一過性で知らせる場合は、画面ごとに自前の文言・配置を作らず、共通トースト基盤を使う。

- API: `import { toast } from '@/lib/toast'` → `toast.success(...)` / `toast.error(...)` / `toast.info(...)`
  - mutation の `onSuccess` / `onError` から呼ぶ。コンポーネント外でも呼べる（モジュールレベルの pub/sub）
  - 既定で 4 秒後に自動で消える。消したくない場合は `{ duration: 0 }`
- 表示は `components/app/toaster.tsx` の `<Toaster/>`（ルートレイアウトに1つだけマウント済み）が担う
- 使い分け
  - **離散的なアクション**（ボタン操作での削除・アーカイブ・コピー等）の結果はトーストで知らせる
  - **インライン編集の保存成功はトーストしない**（blur のたびに鳴ると煩い）。失敗時のみトーストで知らせる
  - フォームのバリデーションエラーなど「その場に留めて直す」性質のものは従来どおり入力近傍にインライン表示する

### 未読件数バッジ

未読件数の表示は `primitives.tsx` の `UnreadBadge` を使う（accent 色のピル・件数表示・既定で 99 超は `99+`）。

- ヘッダーのベル・サイドバー項目・チャンネル一覧・通知パネルのいずれも同じ見た目に揃える。ベルもドットではなく件数を出す
- アイコンに重ねる場合は `size="sm"` ＋ `style={{ position: 'absolute', ... , border: '2px solid var(--card)' }}` で配置する
- 通知1件ごとの「未読マーカー」のような件数を持たない印は、従来どおり小さなドットでよい（件数バッジとは用途が異なる）

### 未統一の UI（残課題）

- **ボタン**: 共通クラス（`btn` / `btn-primary` / `btn-ghost` / `btn-danger`、`globals.css`）とインライン `style` 直書きが混在。新規は共通クラスを使う
- **空状態**: 文言（「まだ〜がありません / はありません / 〜がいません」）とレイアウト（アイコン有無・padding）が揺れている
- **ローディング**: Skeleton / loader アイコン+「取得中…」/ テキスト「読み込み中…」の3様式と、「…」「...」が混在
- **チャンネル削除**: 未実装。設けるかどうか、設けるなら共通 `ConfirmDialog` に乗せるかは未決

---

## UIディレクトリ構成と PC / モバイルの使い分け

```
components/app/
  pages/             PC・モバイル共通のメインビュー
                     isMobile prop で1ペイン／多ペインを切り替える
                     （例: pages/chat.tsx は PC で3カラム、モバイルで1カラム遷移）

  detail-panel/      PC 右側 Detail Panel（Inspector）の中身
                     モバイルのプロジェクト詳細画面でも同じコンポーネントを再利用する
                     project-panel.tsx … プロジェクト詳細パネル
                     tabs/            … プロジェクト詳細のタブ内容（chat / tasks / files など）

  mobile/            モバイルブラウザ専用 UI（PC とナビゲーション構造が根本的に違う場合のみ）
                     nav.tsx / settings.tsx … モバイル用ナビゲーション・設定画面
```

### 「共用」「個別」の判断基準

- **`pages/` で共用（`isMobile` prop）**: PC・モバイルでレイアウトは違うがロジックは同じケース（チャット、タスク一覧等）
- **`mobile/` で個別実装**: ナビゲーション構造そのものが根本的に異なり、`isMobile` を足しても複雑になりすぎるケース

シェル全体は UA で切り分け（middleware → `x-device` ヘッダー）、コンポーネント内は `isMobile` prop で密度・レイアウトを調整するのが基本方針。レスポンシブ CSS は使わない。

### Detail Panel コンポーネントの方針

`src/components/app/detail-panel/` 配下のコンポーネントは **PC 版の右側 Detail Panel（Inspector）向けに設計し、モバイルでも同じコンポーネントを再利用する**前提で開発する。

- Detail Panel コンポーネントは PC シェルへの依存（`AppShellContext` の `openPanel` 等）を持たないよう設計する
- PC 固有の機能が必要な場合は props や Context 経由で注入する
- モバイルブラウザ専用の `MobileShell` は `src/app/(app)/_shells/mobile-shell.tsx`、ナビゲーションは `src/components/app/mobile/nav.tsx` に置く
- プロジェクト詳細は PC・モバイル双方のシェルが `?open=project-{id}` を読み、共通の `ProjectPanel` を表示する

### チャットとタスクのスコープ

- プロジェクト紐付けのチャット / タスクは `detail-panel/tabs/chat-tab.tsx` / `detail-panel/tabs/tasks-tab.tsx` で扱う（単一プロジェクトスコープ）
- 野良も含めた全体一覧は `pages/chat.tsx` / `pages/tasks.tsx`（PC・モバイル共通、`isMobile` prop で切り替え）

---

## 画面ごとの確定仕様

- **ファイル一覧**（`/files`）: `files.project_id` を第一階層に折りたたみ表示し、未所属ファイルは「プロジェクトなし」にまとめる。ストレージ実体の `storage_path` は表示上の分類に使わない。名前付きフィルター `saved_file_filters` は `workspace_id` / `user_id` を必須で保存し、別ワークスペース・別ユーザーへ共有しない
- **設定**: `/settings` 単体は PC で `account`、モバイルで設定一覧（`MobileSettings`）を表示する。モバイルはタップで `/settings/[section]` へ遷移し、PC と同じ `SettingsSectionContent` を全画面表示する（`MobileSettingsDetail`）。`?tab=` 形式は廃止
- **既定画面**: 通常ログイン、認証済みでの `/` / `/auth/*`、オンボーディング完了、ワークスペース作成・切替、PWA / Electron / Expo の起動先はすべて `/chats`。個別会話は `/chats/[channelId]`
- 旧 `/calendar` `/kanban` は Server Component で `/projects` にリダイレクトする。`/projects/[id]` は `/projects?open=project-{id}` にリダイレクトする（`use-detail-panel.ts` は `project-` 接頭辞付きの値しか認識しないため、リンクも必ず接頭辞を付ける）

## localStorage キー命名規則

キー定数は `apps/web/src/lib/storage-keys.ts` の `STORAGE_KEYS` オブジェクトで一元管理する。命名規則・登録済みキー一覧はそのファイルのコメントを参照。

```ts
// ✅ Good
STORAGE_KEYS.projects_filter   // → 'cairn:projects_filter'

// ❌ Bad — インラインの文字列リテラル
localStorage.setItem('cairn:projects_filter', value)
```

---

## Domain Hook のテスト方針

`renderHook` + `QueryClientProvider` でラップし、`fetchWithAuth` をモックして検証する。

```ts
vi.mock('@/lib/fetch-with-auth')

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper, queryClient: qc }
}
```

- キャッシュ操作（楽観的更新・ロールバック）は `queryClient.setQueryData` で初期データを用意してから検証する
- 「キャッシュがある場合はフェッチしない」を検証する場合は `staleTime: Infinity` を指定する（デフォルト `staleTime: 0` だとキャッシュ有りでも background refetch が走る）
- 楽観的更新の in-flight 状態を確認する場合は `fetchWithAuth` を `new Promise(() => {})` で永続 pending にして、`await act(async () => { ...; await new Promise(r => setTimeout(r, 0)) })` でマイクロタスクを消費してから確認する
