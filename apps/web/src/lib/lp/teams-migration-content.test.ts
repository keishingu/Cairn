import { describe, expect, it } from 'vitest'
import {
  TEAMS_EXPORT_FINDINGS,
  TEAMS_MIGRATION_SUPPORT,
  TEAMS_MIGRATION_FAQ,
  renderExportFindings,
  renderFaq,
  renderFaqJsonLd,
  renderTeamsMigrationPage,
} from './teams-migration-content'

const ALL_TEXT = JSON.stringify([TEAMS_MIGRATION_SUPPORT, TEAMS_EXPORT_FINDINGS, TEAMS_MIGRATION_FAQ])

describe('Teams 移行ページの文言', () => {
  it('引き継ぎは私たちが個別に行い、ご自身で使う取り込み機能はないと書く', () => {
    expect(TEAMS_MIGRATION_SUPPORT.detail.ja).toContain('私たちが行います')
    expect(TEAMS_MIGRATION_SUPPORT.detail.ja).toContain('ご自身で操作する取り込み機能はありません')
    const pastMessages = TEAMS_MIGRATION_FAQ.find((f) => f.q.ja === '過去のメッセージは移せますか？')!
    expect(pastMessages.a.ja).toContain('ご自身で操作する取り込み機能はありません')
    expect(pastMessages.a.ja).toContain('元どおりには再現できません')
    expect(ALL_TEXT).not.toMatch(/インポートできます|取り込めます|完全に移行|すべて移せます/)
    expect(ALL_TEXT).not.toMatch(/import everything|fully migrate/i)
  })

  it('エクスポートの解析結果の制限（匿名化・親子関係・OneDrive リンク）を明示する', () => {
    const byItem = Object.fromEntries(TEAMS_EXPORT_FINDINGS.map((f) => [f.item.ja, f.status]))
    expect(byItem['メッセージの本文と投稿日時']).toBe('ok')
    expect(byItem['画像・動画']).toBe('ok')
    expect(byItem['投稿者']).toBe('partial')
    expect(byItem['投稿と返信の関係']).toBe('missing')
    expect(byItem['PDF などの添付ファイル']).toBe('partial')
    expect(renderExportFindings()).toContain('OneDrive')
  })

  it('依頼された 7 問の FAQ を日英で持つ', () => {
    expect(TEAMS_MIGRATION_FAQ.map((f) => f.q.ja)).toEqual([
      '無料で使えますか？',
      '既存の Teams メンバーを招待できますか？',
      '過去のメッセージは移せますか？',
      '画像や PDF も移行できますか？',
      '投稿者や返信関係は再現できますか？',
      'いつまでに移行すべきですか？',
      'Teams のアカウントは必要ですか？',
    ])
    for (const f of TEAMS_MIGRATION_FAQ) {
      expect(f.q.en).not.toBe('')
      expect(f.a.en).not.toBe('')
    }
  })

  it('画面の FAQ と JSON-LD を同じ内容から作る', () => {
    const jsonLd = renderFaqJsonLd()
    const data = JSON.parse(jsonLd.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, ''))
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(TEAMS_MIGRATION_FAQ.length)
    expect(data.mainEntity[0].acceptedAnswer.text).toBe(TEAMS_MIGRATION_FAQ[0]!.a.ja)
    expect(renderFaq().match(/<details class="faq-item">/g)).toHaveLength(TEAMS_MIGRATION_FAQ.length)
  })

  it('JSON-LD の中で script を閉じられないようにする', () => {
    expect(renderFaqJsonLd().slice(0, -'</script>'.length)).not.toContain('</')
  })

  it('目印をすべて差し替え、欠けていれば例外にする', () => {
    const template =
      '<!-- @teams-migration-support --><!-- @teams-export-findings --><!-- @teams-faq --><!-- @teams-faq-jsonld -->'
    const html = renderTeamsMigrationPage(template)
    expect(html).not.toContain('<!-- @')
    expect(html).toContain('tm-findings')

    expect(() => renderTeamsMigrationPage('<!-- @teams-faq -->')).toThrow('@teams-migration-support')
  })
})
