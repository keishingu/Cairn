// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// `/teams/migration`（Teams コミュニティからの移行の案内ページ）で、状況が変わると書き換える文言。
// 静的 HTML（public/teams-migration.html）の目印コメントを、ここから組み立てた HTML に置き換える。
//
// - 引き継ぎの進め方が変わったら TEAMS_MIGRATION_SUPPORT と FAQ を更新する
// - エクスポートの解析結果が変わったら TEAMS_EXPORT_FINDINGS を更新し、checkedAt も直す
// - FAQ は画面と JSON-LD（検索結果向け）の両方をここから作るので、二重に書かない
// 書いてよいこと・いけないことは docs/lp-content-redesign.md §7・§8。

export type Bilingual = { ja: string; en: string }

/** エクスポートの中身を Cairn で使えるか。ok = 取得できる / partial = 一部だけ / missing = 残らない */
export type ExportFindingStatus = 'ok' | 'partial' | 'missing'

export type ExportFinding = {
  status: ExportFindingStatus
  item: Bilingual
  detail: Bilingual
}

export type FaqEntry = { q: Bilingual; a: Bilingual }

/**
 * Teams のエクスポートを Cairn へ引き継ぐ進め方。取り込みは運営側（私たち）が個別に行い、
 * 利用者が自分で実行する取り込み機能は提供しない方針。
 */
export const TEAMS_MIGRATION_SUPPORT = {
  label: { ja: '私たちが個別に対応', en: 'We do it for you' },
  detail: {
    ja: 'お問い合わせのうえで、Teams のエクスポートから会話履歴や写真・動画を Cairn に引き継ぐ作業を私たちが行います。ご自身で操作する取り込み機能はありません。引き継げる範囲はエクスポートの内容によって変わるため、事前に確認してお伝えします。',
    en: 'Once you contact us, we bring your chat history, photos, and videos from the Teams export into Cairn for you. There is no self-service import. What can be carried over depends on your export, so we check it and tell you up front.',
  },
} as const satisfies { label: Bilingual; detail: Bilingual }

export const TEAMS_EXPORT_FINDINGS_CHECKED_AT: Bilingual = { ja: '2026年11月', en: 'November 2026' }

export const TEAMS_EXPORT_FINDINGS: ExportFinding[] = [
  {
    status: 'ok',
    item: { ja: 'メッセージの本文と投稿日時', en: 'Message text and post times' },
    detail: { ja: 'エクスポートから取得できます。', en: 'Included in the export.' },
  },
  {
    status: 'ok',
    item: { ja: '画像・動画', en: 'Images and videos' },
    detail: { ja: 'エクスポートに含まれます。', en: 'Included in the export.' },
  },
  {
    status: 'partial',
    item: { ja: '投稿者', en: 'Who posted' },
    detail: {
      ja: '一部の投稿者は匿名化され、誰の投稿か分からない状態で出力されます。',
      en: 'Some authors are anonymized, so those posts cannot be tied to a person.',
    },
  },
  {
    status: 'missing',
    item: { ja: '投稿と返信の関係', en: 'Which reply belongs to which post' },
    detail: {
      ja: 'どの投稿への返信かという親子関係はエクスポートに残りません。',
      en: 'The link between a post and its replies is not kept in the export.',
    },
  },
  {
    status: 'partial',
    item: { ja: 'PDF などの添付ファイル', en: 'PDFs and other attachments' },
    detail: {
      ja: 'OneDrive へのリンクだけが出力され、ファイルの実体が含まれない場合があります。必要なファイルは OneDrive から保存してください。',
      en: 'The export may contain only a OneDrive link, not the file itself. Save the files you need from OneDrive.',
    },
  },
]

const STATUS_LABEL: Record<ExportFindingStatus, Bilingual> = {
  ok: { ja: '取得できる', en: 'Available' },
  partial: { ja: '一部のみ', en: 'Partly' },
  missing: { ja: '残らない', en: 'Not kept' },
}

export const TEAMS_MIGRATION_FAQ: FaqEntry[] = [
  {
    q: { ja: '無料で使えますか？', en: 'Is Cairn free?' },
    a: {
      ja: 'はい。無料プランに期限はなく、メッセージ・履歴・メンバー数にも上限はありません。ファイルは 100GB（1ファイル 50MB）まで無料です。100GB を超える保存と AI を使う人だけ、Solo（1人・月 ¥300）に入ります。移行の相談も無料です。',
      en: 'Yes. The free plan has no time limit and no caps on messages, history, or members. Files are free up to 100 GB (50 MB per file). Only people who need storage beyond 100 GB or want AI join Solo (¥300 per person per month). The migration consultation is also free.',
    },
  },
  {
    q: { ja: '既存の Teams メンバーを招待できますか？', en: 'Can we invite the members of our Teams community?' },
    a: {
      ja: 'はい。Cairn で招待リンクを作り、Teams のコミュニティやグループチャットで共有すれば参加してもらえます。Teams のメンバー一覧を自動で取り込む機能はありません。参加する人は Google・Apple のアカウントかメールアドレスで Cairn のアカウントを作ります。',
      en: 'Yes. Create an invite link in Cairn and share it in your Teams community or a group chat. Cairn cannot import the Teams member list automatically. Each person signs up for Cairn with a Google or Apple account, or an email address.',
    },
  },
  {
    q: { ja: '過去のメッセージは移せますか？', en: 'Can we bring our past messages?' },
    a: {
      ja: 'はい。お問い合わせのうえで、Teams のエクスポートからメッセージの本文と投稿日時を、私たちが Cairn に引き継ぎます（ご自身で操作する取り込み機能はありません）。ただし、エクスポートでは一部の投稿者が匿名化され、返信の関係も残らないため、元どおりには再現できません。',
      en: 'Yes. Once you contact us, we bring message text and post times from your Teams export into Cairn for you (there is no self-service import). The export anonymizes some authors and drops reply threads, though, so the history cannot be recreated exactly as it was.',
    },
  },
  {
    q: { ja: '画像や PDF も移行できますか？', en: 'Can images and PDFs move too?' },
    a: {
      ja: '画像・動画はエクスポートに含まれるため、会話と一緒に引き継ぎます。PDF などの添付ファイルは OneDrive へのリンクだけで、ファイルの実体が含まれない場合があります。その場合は OneDrive から保存したファイルを Cairn にアップロードしてください（1ファイル 50MB まで）。',
      en: 'Images and videos are in the export, so we carry them over along with the conversations. PDFs and other attachments may appear only as OneDrive links without the file itself. In that case, save the files from OneDrive and upload them to Cairn (up to 50 MB per file).',
    },
  },
  {
    q: { ja: '投稿者や返信関係は再現できますか？', en: 'Will authors and reply threads be preserved?' },
    a: {
      ja: '完全には再現できません。エクスポートでは一部の投稿者が匿名化され、どの投稿への返信かという親子関係も残りません。どこまで復元するかは、ご相談の際に一緒に検討します。',
      en: 'Not completely. The export anonymizes some authors and does not keep which reply belongs to which post. We can talk through how much to rebuild when you contact us.',
    },
  },
  {
    q: { ja: 'いつまでに移行すべきですか？', en: 'When should we move?' },
    a: {
      ja: 'Microsoft は、個人向け Teams のコミュニティを 2026年12月以降に利用できなくなると案内しています（終了日は明記されていません）。コミュニティから退出・削除されるとエクスポートできなくなるため、残したいデータは早めにエクスポートしてください。',
      en: 'Microsoft says communities in Teams for personal use will no longer be available starting December 2026 (no exact day is given). Once you leave or are removed from a community, you can no longer export it, so export what you want to keep early.',
    },
  },
  {
    q: { ja: 'Teams のアカウントは必要ですか？', en: 'Do we need a Teams account?' },
    a: {
      ja: 'Cairn を使うのに Teams や Microsoft のアカウントは必要ありません。ただし、Teams のデータをエクスポートするには、コミュニティに参加している Microsoft アカウントでサインインする必要があります。',
      en: 'You don’t need a Teams or Microsoft account to use Cairn. To export your Teams data, though, you need to sign in with the Microsoft account you use in the community.',
    },
  },
]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bilingualSpans(text: Bilingual): string {
  return `<span data-i="ja">${escapeHtml(text.ja)}</span><span data-i="en">${escapeHtml(text.en)}</span>`
}

export function renderMigrationSupport(): string {
  return (
    `<p class="tm-status-label"><span class="tm-pill tm-pill--ok">${bilingualSpans(TEAMS_MIGRATION_SUPPORT.label)}</span></p>\n` +
    `<p class="tm-status-text">${bilingualSpans(TEAMS_MIGRATION_SUPPORT.detail)}</p>`
  )
}

export function renderExportFindings(): string {
  const rows = TEAMS_EXPORT_FINDINGS.map(
    (f) =>
      `<li class="tm-finding" data-status="${f.status}">` +
      `<span class="tm-pill tm-pill--${f.status}">${bilingualSpans(STATUS_LABEL[f.status])}</span>` +
      `<div><b>${bilingualSpans(f.item)}</b><p>${bilingualSpans(f.detail)}</p></div>` +
      `</li>`,
  ).join('\n')
  const note: Bilingual = {
    ja: `${TEAMS_EXPORT_FINDINGS_CHECKED_AT.ja}時点で、実際の Teams コミュニティのエクスポートを解析した結果です。Microsoft がエクスポートの内容を変えると、結果が変わる場合があります。`,
    en: `Based on our analysis of a real Teams community export as of ${TEAMS_EXPORT_FINDINGS_CHECKED_AT.en}. Results may change if Microsoft changes what the export contains.`,
  }
  return `<ul class="tm-findings">\n${rows}\n</ul>\n<p class="tm-note">${bilingualSpans(note)}</p>`
}

export function renderFaq(): string {
  return TEAMS_MIGRATION_FAQ.map(
    (f) =>
      `<details class="faq-item">` +
      `<summary>${bilingualSpans(f.q)}</summary>` +
      `<p class="faq-a">${bilingualSpans(f.a)}</p>` +
      `</details>`,
  ).join('\n')
}

export function renderFaqJsonLd(): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: TEAMS_MIGRATION_FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q.ja,
      acceptedAnswer: { '@type': 'Answer', text: f.a.ja },
    })),
  }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

const SLOTS: Record<string, () => string> = {
  'teams-migration-support': renderMigrationSupport,
  'teams-export-findings': renderExportFindings,
  'teams-faq': renderFaq,
  'teams-faq-jsonld': renderFaqJsonLd,
}

/** テンプレートの `<!-- @slot-name -->` を差し替える。目印が欠けていたら壊れたページを出さず例外にする */
export function renderTeamsMigrationPage(template: string): string {
  let html = template
  for (const [name, render] of Object.entries(SLOTS)) {
    const marker = `<!-- @${name} -->`
    if (!html.includes(marker)) throw new Error(`teams-migration.html に ${marker} がありません`)
    html = html.replace(marker, render())
  }
  return html
}
