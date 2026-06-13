# フロントエンドコンポーネント設計ガイドライン

## コンポーネントの3層構造

page → organism/container（省略可）→ molecule/atom の3層を原則とする。

### Cairn のディレクトリとの対応

| 層 | ディレクトリ例 | 役割 |
|---|---|---|
| page | `components/app/pages/*.tsx` | データ取得・イベント定義のみ。UIマークアップを書かない |
| organism | `components/app/detail-panel/tabs/*.tsx` など | データ取得可。子コンポーネントへ受け渡す |
| molecule/atom | `components/app/primitives/` など | props のみで動く純粋な表示コンポーネント |

### ページ層の責務

- 子コンポーネントの呼び出しとデータ・イベントの受け渡しのみ
- UIマークアップはファイル内にインラインで定義しない
- ページ固有のロジックも Domain Hook として `src/hooks/` に切り出す

### コンポーネント層のルール

- `useQuery` / `useMutation` などの副作用は持たせない。必要なデータは props 経由
- `margin` / `width` を固定値で設定しない（「どこに置いても動くべき」）
  - どうしても必要な場合は props で切り替えできるようにする
- コンポーネントがコンポーネントを呼び出すのは極力避ける

---

## Domain Hook パターン

コンポーネント内で直接 `useQuery` / `useMutation` / `fetchWithAuth` を呼び出さず、必ず Domain Hook にカプセル化する。

### 配置と命名

- 場所: `apps/web/src/hooks/`
- 命名: `use-{resource}-{action}.ts`

```
hooks/
  use-patch-project.ts       # プロジェクトの更新・削除
  use-project-statuses.ts    # ステータス一覧
  use-project-tasks.ts       # タスク一覧・トグル・作成
  use-project-files.ts       # ファイル一覧・削除
  use-project-members.ts     # メンバー一覧・追加・削除
```

### フックが担うこと

- `fetchWithAuth` を使った API リクエスト
- ローディング・エラー状態の管理
- キャッシュ操作（楽観的更新・invalidation）

### コンポーネントが担うこと

- フックの呼び出し
- UIステート（モーダルの開閉・選択状態など）
- `mutate()` の第2引数を使ったUI側コールバック

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

---

## UIディレクトリ構成と PC / モバイルの使い分け

```
components/app/
  pages/             PC・モバイル共通のメインビュー
                     isMobile prop で1ペイン／多ペインを切り替える
                     （例: pages/chat.tsx は PC で3カラム、モバイルで1カラム遷移）

  detail-panel/      PC 右側 Detail Panel（Inspector）の中身
                     モバイルのプロジェクト詳細画面でも同じコンポーネントを再利用する
                     panel.tsx        … PC Detail Panel のシェル（420px 固定パネル）
                     tabs/            … プロジェクト詳細のタブ内容（chat / tasks / files など）
                     pages/           … モバイルナビバーの行き先ページ（暫定置き場）

  mobile/            モバイルブラウザ専用 UI（PC とナビゲーション構造が根本的に違う場合のみ）
                     project-screen.tsx … モバイル用プロジェクト詳細シェル
                                          （中身は detail-panel/tabs/* を使用）
```

### 「共用」「個別」の判断基準

- **`pages/` で共用（`isMobile` prop）**: PC・モバイルでレイアウトは違うがロジックは同じケース（チャット、タスク一覧等）
- **`mobile/` で個別実装**: ナビゲーション構造そのものが根本的に異なり、`isMobile` を足しても複雑になりすぎるケース

シェル全体は UA で切り分け（middleware → `x-device` ヘッダー）、コンポーネント内は `isMobile` prop で密度・レイアウトを調整するのが基本方針。レスポンシブ CSS は使わない。

### Detail Panel コンポーネントの方針

`src/components/app/detail-panel/` 配下のコンポーネントは **PC 版の右側 Detail Panel（Inspector）向けに設計し、モバイルでも同じコンポーネントを再利用する**前提で開発する。

- Detail Panel コンポーネントは PC シェルへの依存（`AppShellContext` の `openPanel` 等）を持たないよう設計する
- PC 固有の機能が必要な場合は props や Context 経由で注入する
- `MobileShell` / `MobileNav` はモバイルブラウザ専用のラッパーのため `_shells/` 配下に残す

### チャットとタスクのスコープ

- プロジェクト紐付けのチャット / タスクは `detail-panel/tabs/chat-tab.tsx` / `detail-panel/tabs/tasks-tab.tsx` で扱う（単一プロジェクトスコープ）
- 野良も含めた全体一覧は `pages/chat.tsx` / `pages/tasks.tsx`（PC・モバイル共通、`isMobile` prop で切り替え）

---

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
