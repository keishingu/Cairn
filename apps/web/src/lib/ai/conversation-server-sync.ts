// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの会話を、サーバーが保存した内容で置き換えてよいかの判定（docs/10_ai_member_design.md「会話への添付」）。
// 送信済みのメッセージはサーバーを正とするが、次のときは置き換えない（表示中のやり取りを消さない）。
// - 応答を受信している途中
// - 送った依頼が、まだ保存された会話に無い（依頼の ID はクライアントが決め、サーバーも同じ ID で保存する）
// - すでに反映した取り直しより前に始めた取り直しの結果（通信は順不同に返る）

export type SyncDecision = 'apply' | 'stale' | 'waiting'

export class ConversationServerSync {
  private requestSeq = 0
  private appliedSeq = 0
  private readonly unsavedIds = new Set<string>()

  /** 依頼を送った。保存を確かめるまで置き換えない */
  sent(messageId: string): void {
    this.unsavedIds.add(messageId)
  }

  /** 依頼が保存されなかった（送信に失敗した・保存を待ちきれなかった）。この依頼だけ待つのをやめる */
  abandoned(messageId: string): void {
    this.unsavedIds.delete(messageId)
  }

  /** この依頼の保存をまだ待っているか */
  isAwaiting(messageId: string): boolean {
    return this.unsavedIds.has(messageId)
  }

  /** 取り直しを始める。結果を decide に渡すときの順番を返す */
  begin(): number {
    this.requestSeq += 1
    return this.requestSeq
  }

  /**
   * 取り直した会話で置き換えてよいかを決める。'apply' を返したら、その会話で置き換えること。
   * 'stale' は、より新しい取り直しをすでに反映したので捨ててよい結果
   */
  decide(savedIds: ReadonlyArray<string>, seq: number, isReceiving: boolean): SyncDecision {
    if (seq < this.appliedSeq) return 'stale'
    if (isReceiving) return 'waiting'
    const saved = new Set(savedIds)
    for (const id of this.unsavedIds) if (saved.has(id)) this.unsavedIds.delete(id)
    if (this.unsavedIds.size > 0) return 'waiting'
    this.appliedSeq = seq
    return 'apply'
  }
}
