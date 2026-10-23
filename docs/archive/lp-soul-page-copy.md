# Cairn Soul ページ コピー案（ドラフト）

> ステータス: 設計時スナップショット（コピー確定前のドラフト）
> 目的: `/lp`（機能ページ）とは別に新設する **Soul ページ** に載せる文言を確定する。
> 方針: 機能ではなく思想を語る。主語は「探究者 / Explorer」、動詞は「推進 / advance」。
> 用語: 「管理」は否定文の中だけで使う。基本語彙は 推進 / 自律 / 信頼 / 準備 / 探究 / Soul / Intent / Context / Advancement。

---

## 0. ページ全体の構成

```text
1. Hero（思想の一行）
2. Manifesto（短い宣言）
3. Open Soul Software とは
4. SOUL.md（機械可読の魂）
5. What we will not build（作らないもの）
6. Not management, but advancement（管理ではなく推進）
7. Final CTA（機能ページ / デモ / GitHub へ）
```

各セクション、英日併記。LP 本体（`cairn-lp.css`）の `data-i="ja" / data-i="en"` 切替を流用する前提。

---

## 1. Hero

**英語（主）**

```text
People are not resources.
People are explorers.
```

**日本語（主）**

```text
人はリソースではない。
人は探究者だ。
```

**サブコピー（英）**

```text
Cairn is Open Soul Software for teams that move forward —
not a tool to manage people, but a tool to advance projects.
```

**サブコピー（日）**

```text
Cairn は、前に進むチームのための Open Soul Software。
人を管理するためではなく、プロジェクトを推進するためのソフトウェアです。
```

> 補足: ブランド名との接続を一言添えるなら `Cairns guide explorers.（ケルンは探究者を導く）` を Hero 近くの小さなタグラインに。

---

## 2. Manifesto（短い宣言）

**英語**

```text
We optimize for action, not control.
We build for trust, not surveillance.
We value real-world experience over engagement.

Most software manages people.
Cairn helps people move.
```

**日本語**

```text
私たちは、統制ではなく行動のために最適化する。
私たちは、監視ではなく信頼のためにつくる。
私たちは、エンゲージメントより、現実世界での経験を大切にする。

多くのソフトウェアは、人を管理する。
Cairn は、人が前へ進むことを助ける。
```

---

## 3. Open Soul Software とは

**見出し**

```text
Open Source opened the code.
Open Soul opens the intent.
```

```text
Open Source はコードを開いた。
Open Soul は思想を開く。
```

**本文（英）**

```text
For decades, "OSS" meant Open Source Software — code opened to human developers.

In the age of AI, code is no longer the scarce part. AI can read it, write it, and improve it.
What machines cannot infer is intent:

- why this exists
- what we care about
- what we will never build

Cairn is Open Soul Software. We open not only our source code,
but our mission, our values, and our non-goals — so that both humans and AI
can carry the project forward without losing its Soul.
```

**本文（日）**

```text
これまで「OSS」は Open Source Software ——人間の開発者に開かれたコード——を意味していた。

AI の時代、希少なのはもうコードではない。AI はコードを読み、書き、改善できる。
機械が読み取れないのは「意図」だ。

- なぜ存在するのか
- 何を大切にするのか
- 何を決してつくらないのか

Cairn は Open Soul Software です。私たちはソースコードだけでなく、
ミッション・価値観・やらないことまで公開する。
人も AI も、このプロジェクトの Soul を損なわずに前へ進められるように。
```

> 系譜の注記（任意で小さく）: `Open Source Software → SOUL.md → Open Soul Software`。
> AI エージェントに人格を与える `SOUL.md` 文化（OpenClaw 等）へのリスペクトを 1 文で明記してもよい。

---

## 4. SOUL.md（機械可読の魂）

> ページ内にコードカードとして掲示する。これは将来の実 `SOUL.md` の公開版という位置づけ。

```md
# SOUL.md

Cairn exists to help people explore — in the mountains, in research, in code.

People are not resources.
People are explorers.

We do not optimize for control.
We optimize for action.

We do not rank people.
We help them prepare.

We do not maximize engagement.
We maximize real-world experience.

When in doubt,
choose the path that lets people go further.
```

**日本語訳（カードの下、または対訳タブ）**

```text
Cairn は、人が探究することを助けるために存在する——山でも、研究でも、コードでも。

人はリソースではない。人は探究者だ。
統制のために最適化しない。行動のために最適化する。
人をランク付けしない。準備を助ける。
エンゲージメントを最大化しない。現実世界での経験を最大化する。

迷ったときは、人がより遠くへ行ける道を選ぶ。
```

---

## 5. What we will not build（作らないもの）

**見出し**

```text
What we will not build.
```

```text
Cairn が、つくらないもの。
```

**リスト（英 / 日）**

```text
- Activity rankings              活動量ランキング
- Surveillance dashboards        監視ダッシュボード
- Productivity scores            生産性スコア
- Engagement traps               エンゲージメントを煽る仕掛け
- Tools that keep people at their desks   人を机に縛り付ける機能
```

**締めの一文（英）**

```text
Anyone can add features. Saying no is the harder, more valuable work.
These non-goals are part of our Soul.
```

**締めの一文（日）**

```text
機能を足すのは誰にでもできる。「つくらない」と言い切ることの方が難しく、価値がある。
この「やらないこと」も、私たちの Soul の一部です。
```

---

## 6. Not management, but advancement（管理ではなく推進）

> Soul を「AI の振る舞い」に落として見せるセクション。具体例で思想を裏づける。

**見出し**

```text
AI for advancement, not surveillance.
```

```text
監視のための AI ではなく、推進のための AI。
```

**対比（英）**

```text
Management software asks:
- Who is late?
- Who is blocking the project?
- Who is underperforming?

Cairn asks:
- What is the next step?
- What is missing?
- Who can help?
- What did we learn last time?
```

**対比（日）**

```text
管理ソフトウェアが問うこと:
- 誰が遅れているか
- 誰がプロジェクトを止めているか
- 誰が動いていないか

Cairn が問うこと:
- 次に何をすれば前に進むか
- 何が足りないか
- 誰に相談できるか
- 前回、何を学んだか
```

**AI の挙動例（英日）**

```text
This plan resembles past rejected proposals.
Adding a rockfall-risk section will make it easier to approve.

この計画は、過去に否決された案件と似ています。
落石リスクの項目を追加すると、審議が通りやすくなります。
```

```text
No one is assigned to gear yet.
Last year on the same route, the lead was decided one week before departure.

装備担当がまだ決まっていません。
昨年の同じルートでは、出発の 1 週間前に担当を決めていました。
```

---

## 7. Final CTA

**コピー（英）**

```text
Code is open. Soul is open.
Move your project forward — without losing why it exists.
```

**コピー（日）**

```text
コードも、Soul も、開いている。
存在する理由を見失わずに、プロジェクトを前へ。
```

**ボタン**

```text
Read the Manifesto（このページ自身。アンカー or 重複時は省略）
See the Product →  /lp
Try Demo
View on GitHub
```

```text
機能を見る → /lp
デモを試す
View on GitHub
```

---

## メモ / 未決事項

- ページの URL: `/lp/soul`（`cairn-lp.css` 流用が容易）か、`/soul` / `/manifesto` か。要決定。
- `/lp` 側ナビ先頭に「Soul →」、Soul 側 CTA に「See the Product → /lp」で相互リンク。
- Hero の主コピー候補（A/B 検討用）:
  - A: `People are not resources. / People are explorers.`（推し）
  - B: `More exploration. Less management.`
  - C: `Open Soul Software for project advancement.`
- 「Explorer / 探究者」は英=探検、日=探究のニュアンス差を意図的に重ねて使う方針。
- OpenClaw / SOUL.md 文化へのリスペクト明記をどこまで前面に出すかは要相談。
