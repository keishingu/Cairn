// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 新しさで並べ替えるときは、意味の近さの上位からこの倍数だけ候補を取り、その中で並べ替える。
// 候補を広げないと、上位 N 件の中で順番が入れ替わるだけで、少し遠いが新しい資料が入れない。
export const RECENCY_CANDIDATE_MULTIPLIER = 4

const DAY_MS = 24 * 60 * 60 * 1000

// 半減期 halfLifeDays ごとに点数を半分にする係数（0〜1）。未来の日付は 0 日として扱う。
export function recencyFactor(sourceDate: Date, now: Date, halfLifeDays: number): number {
  const ageDays = Math.max(0, (now.getTime() - sourceDate.getTime()) / DAY_MS)
  return Math.pow(0.5, ageDays / halfLifeDays)
}

export interface RecencyCandidate {
  similarity: number
  // プロジェクトは更新日、ファイルは登録日。メンバーなど新しさを持たない資料は null（係数を掛けない）
  sourceDate: Date | null
}

// 点数 = 意味の近さ × 新しさの係数 で並べ替える。点数が同じなら元の順（意味の近さの順）を保つ。
// 類似度の下限（minSimilarity）は呼び出し側で元の類似度に対して掛けてあり、新しさで関係の薄い資料が入ることはない。
export function rankByRecency<T extends RecencyCandidate>(
  candidates: readonly T[],
  halfLifeDays: number,
  now: Date,
): (T & { score: number })[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: candidate.sourceDate
        ? candidate.similarity * recencyFactor(candidate.sourceDate, now, halfLifeDays)
        : candidate.similarity,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate, score }) => ({ ...candidate, score }))
}
