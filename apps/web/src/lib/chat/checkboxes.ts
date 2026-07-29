// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const CHECKBOX_RE = /^([-*+] \[)([ x])(\] .*)$/gm

export interface ParsedCheckbox {
  index: number
  text: string
  checked: boolean
}

export function parseCheckboxes(content: string): ParsedCheckbox[] {
  const result: ParsedCheckbox[] = []
  let index = 0
  for (const match of content.matchAll(CHECKBOX_RE)) {
    result.push({
      index,
      text: match[3]!.slice(2).trim(),
      checked: match[2] === 'x',
    })
    index++
  }
  return result
}

export function toggleCheckboxAt(content: string, checkboxIndex: number, checked: boolean): string {
  let current = 0
  return content.replace(CHECKBOX_RE, (_, before, _state, after) => {
    const isTarget = current === checkboxIndex
    current++
    return `${before}${isTarget ? (checked ? 'x' : ' ') : _state}${after}`
  })
}

// 指定インデックスのチェックボックスの文言だけを差し替える（チェック状態は保持する）。
// タスク側でタイトルを変更したとき、紐付く元メッセージのチェックボックス行へ逆同期するために使う。
export function replaceCheckboxLabelAt(content: string, checkboxIndex: number, newLabel: string): string {
  let current = 0
  return content.replace(CHECKBOX_RE, (whole, before, state) => {
    const isTarget = current === checkboxIndex
    current++
    if (!isTarget) return whole
    return `${before}${state}] ${newLabel}`
  })
}
