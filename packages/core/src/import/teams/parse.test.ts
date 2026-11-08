// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { summarizeConversation } from '../model'
import { ANONYMOUS_IDENTITY_KEY, TeamsExportFormatError, parseTeamsExport, teamsConversationKind } from './parse'

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'messages.json'), 'utf8')) as unknown
const COMMUNITY = '19:FixtureCommunityAAAAAAAAAAAAAAAAAAAAAAAAAAA1@thread.v2'
const ONE_ON_ONE = '19:uni01_fixtureoneononeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@thread.v2'
const MEETING = '19:meeting_FixtureMeetingAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA@thread.v2'

function parse() {
  return parseTeamsExport(fixture, { timeZone: 'Asia/Tokyo' })
}

function message(id: string) {
  const found = parse().messagesByConversation[COMMUNITY]!.find(m => m.externalId === id)
  if (!found) throw new Error(`message ${id} not found`)
  return found
}

describe('parseTeamsExport: 会話', () => {
  test('会話 ID の接頭辞で種類を判定し、グループ会話だけを取り込み対象にする', () => {
    const bundle = parse()
    const kinds = Object.fromEntries(bundle.conversations.map(c => [c.externalId, [c.kind, c.importable]]))
    expect(kinds[COMMUNITY]).toEqual(['group', true])
    expect(kinds[ONE_ON_ONE]).toEqual(['one-on-one', false])
    expect(kinds[MEETING]).toEqual(['meeting', false])
  })

  test('会話名・人数・期間を読み取る', () => {
    const conversation = parse().conversations.find(c => c.externalId === COMMUNITY)!
    expect(conversation.name).toBe('架空の山の会')
    expect(conversation.memberCount).toBe(5)
    expect(conversation.firstMessageAt).toBe('2025-10-09T08:53:20.000Z')
  })

  test('Teams のエクスポートでない JSON はエラーにする', () => {
    expect(() => parseTeamsExport({ foo: 1 })).toThrow(TeamsExportFormatError)
    expect(() => parseTeamsExport([])).toThrow(TeamsExportFormatError)
  })

  test.each([
    ['19:abc@thread.v2', 'group'],
    ['19:uni01_xyz@thread.v2', 'one-on-one'],
    ['19:meeting_xyz@thread.v2', 'meeting'],
    ['19:stream01_xyz@thread.v2', 'other'],
    ['48:notes', 'other'],
  ])('teamsConversationKind(%s) は %s', (id, kind) => {
    expect(teamsConversationKind(id)).toBe(kind)
  })
})

describe('parseTeamsExport: 除外するメッセージ', () => {
  test('削除済み・システム・通話は取り込まず、理由を残す', () => {
    const bundle = parse()
    const reasons = Object.fromEntries(bundle.skipped.filter(s => s.conversationExternalId === COMMUNITY).map(s => [s.externalId, s.reason]))
    expect(reasons).toEqual({ '1760000900000': 'deleted', '1760001000000': 'system', '1760001200000': 'call' })
    const ids = bundle.messagesByConversation[COMMUNITY]!.map(m => m.externalId)
    expect(ids).not.toContain('1760000900000')
  })

  test('取り込むメッセージは投稿日時の昇順に並ぶ', () => {
    const times = parse().messagesByConversation[COMMUNITY]!.map(m => m.sentAt)
    expect([...times].sort()).toEqual(times)
  })
})

describe('parseTeamsExport: 投稿者', () => {
  test('エクスポートした本人の投稿は本人の identity になる', () => {
    expect(message('1760000000000').identityKey).toBe('mri:8:live:.cid.0000000000owner')
  })

  test('表示名だけの投稿者は、リアクションで ID が一意に分かればその ID の identity になる', () => {
    expect(message('1760000500000').identityKey).toBe('mri:8:live:.cid.00000000yamada')
    const identity = parse().identities.find(i => i.key === 'mri:8:live:.cid.00000000yamada')
    expect(identity).toMatchObject({ displayName: '山田 太郎', anonymous: false, kind: 'named' })
  })

  test('ID が分からない表示名だけの投稿者は name: の identity になる', () => {
    expect(message('1760000800000').identityKey).toBe('name:Hanako Sato')
  })

  test('表示名も ID も無い投稿は「投稿者不明」にまとめ、誰かを推定しない', () => {
    const anonymous = message('1760000700000')
    expect(anonymous.identityKey).toBe(ANONYMOUS_IDENTITY_KEY)
    expect(anonymous.attributes).toMatchObject({ senderIdPresent: false, senderNamePresent: false })
    const identity = parse().identities.find(i => i.key === ANONYMOUS_IDENTITY_KEY)
    expect(identity).toMatchObject({ anonymous: true, displayName: null })
  })

  test('取り込み結果の集計に投稿者不明の件数が出る', () => {
    const summary = summarizeConversation(parse(), COMMUNITY)
    expect(summary.anonymousMessages).toBe(2)
    expect(summary.deletedSkipped).toBe(1)
    expect(summary.systemSkipped).toBe(2)
  })
})

describe('parseTeamsExport: 日時', () => {
  test('元の投稿日時を UTC の ISO 形式で保持する', () => {
    expect(message('1760000500000').sentAt).toBe('2025-10-09T09:01:40.000Z')
  })

  test('編集日時（edittime）を保持する', () => {
    expect(message('1760000500000').editedAt).toBe(new Date(1760000600000).toISOString())
    expect(message('1760000800000').editedAt).toBeNull()
  })

  test('イベントの日時は指定したタイムゾーンで本文に書く', () => {
    const event = message('1760001100000')
    expect(event.attributes.isEventCard).toBe(true)
    expect(event.text).toContain('架空岳 日帰り')
    expect(event.text).toContain('2025-10-12 08:00 〜 2025-10-12 18:00（Asia/Tokyo）')
    expect(event.text).toContain('場所: 架空岳登山口')
  })

  test('タイムゾーンを指定しなければ UTC で書く', () => {
    const bundle = parseTeamsExport(fixture)
    const event = bundle.messagesByConversation[COMMUNITY]!.find(m => m.externalId === '1760001100000')!
    expect(event.text).toContain('2025-10-11 23:00 〜 2025-10-12 09:00（UTC）')
  })
})

describe('parseTeamsExport: 本文', () => {
  test('件名を太字の1行目にし、メンションは名前の文字列として残す（Cairn のメンションにしない）', () => {
    const text = message('1760000000000').text
    expect(text.startsWith('**10月の山行**\n')).toBe(true)
    expect(text).toContain('@山田 太郎 さん')
    expect(text).not.toMatch(/<@/)
    expect(message('1760000000000').attributes.mentionCount).toBe(1)
  })

  test('http(s) のリンクだけをリンクにし、javascript: は文字列だけ残す', () => {
    const text = message('1760000000000').text
    expect(text).toContain('[計画](https://example.com/plan)')
    expect(text).not.toContain('javascript:')
    expect(text).toContain('危険')
  })

  test('本文中のメンション記法・Markdown 記号はエスケープして文字どおり表示させる', () => {
    const text = message('1760000500000').text
    expect(text).toContain('\\<\u2060@00000000-0000-0000-0000-000000000001\\>')
    expect(text).not.toMatch(/<@/)
    expect(text).toContain('\\*強調ではない\\*')
  })

  test('script タグは中身ごと捨てる', () => {
    expect(message('1760000700000').text).not.toContain('alert')
  })

  test('Text 型の行頭の番号・箇条書き記号はエスケープする', () => {
    expect(message('1760000800000').text).toBe('1\\. 番号付きではない\n\\- 箇条書きではない')
  })

  test('引用返信の引用部分は本文から外し、引用元の ID だけ残す', () => {
    const quote = message('1760000700000')
    expect(quote.quotedExternalId).toBe('1760000500000')
    expect(quote.text.startsWith('写真ありがとうございます')).toBe(true)
  })
})

describe('parseTeamsExport: リアクション', () => {
  test('Teams のリアクション名を Unicode 絵文字に変換し、反応した人を識別する', () => {
    const reactions = message('1760000000000').reactions
    expect(reactions).toHaveLength(4)
    expect(reactions.filter(r => r.emoji === '👍')).toHaveLength(3)
    expect(reactions.find(r => r.sourceKey === '2705_whiteheavycheckmark')?.emoji).toBe('✅')
  })

  test('表示名が匿名でも ID があれば人ごとに区別し、ID も無ければ投稿者不明にする', () => {
    const keys = message('1760000000000').reactions.map(r => r.identityKey)
    expect(keys).toContain('mri:8:live:.cid.00000000yamada')
    expect(keys).toContain('mri:8:live:.cid.0000000unknown1')
    expect(keys).toContain(ANONYMOUS_IDENTITY_KEY)
    const unnamed = parse().identities.find(i => i.key === 'mri:8:live:.cid.0000000unknown1')
    expect(unnamed).toMatchObject({ displayName: null, anonymous: false, kind: 'unnamed-participant' })
  })
})

describe('parseTeamsExport: メディアと添付', () => {
  test('amsreferences と本文の画像から AMS オブジェクト ID を重複なく集める', () => {
    expect(message('1760000500000').media).toEqual([{ objectId: '0-wus-d1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }])
  })

  test('同じ AMS オブジェクトを複数のメッセージが参照できる', () => {
    expect(message('1760000700000').media).toEqual([{ objectId: '0-wus-d1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }])
  })

  test('OneDrive の共有リンクはリンクとして残し、本体が無いことを本文に明記する', () => {
    const quote = message('1760000700000')
    expect(quote.externalFiles).toEqual([
      { fileName: '計画書.pdf', url: 'https://1drv.ms/b/c/0000/EXAMPLE', uploadError: false },
      { fileName: '失敗.pdf', url: null, uploadError: true },
    ])
    expect(quote.text).toContain('ファイル本体は取り込まれていません')
    expect(quote.text).toContain('[計画書.pdf](https://1drv.ms/b/c/0000/EXAMPLE)')
    expect(quote.text).toContain('失敗.pdf（Teams でのアップロードに失敗していたファイル）')
  })
})
