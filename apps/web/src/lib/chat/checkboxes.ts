// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const CHECKBOX_RE = /^([-*+] \[)([ x])(\] .*)$/gm

export interface ParsedCheckbox {
  index: number
  text: string
  checked: boolean
}

export function canExtractTasksFromChannel(channelType: 'workspace' | 'project' | 'dm'): boolean {
  return channelType !== 'dm'
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

/** 内容が同じチェックボックスを先に対応させ、挿入・削除・並べ替えでもタスクの同一性を保つ。 */
export function reconcileCheckboxes(oldBoxes: ParsedCheckbox[], newBoxes: ParsedCheckbox[]) {
  const unmatchedOld = new Set(oldBoxes.map(box => box.index))
  const unmatchedNew = new Set(newBoxes.map(box => box.index))
  const matched: Array<{ oldBox: ParsedCheckbox; newBox: ParsedCheckbox }> = []

  const match = (oldBox: ParsedCheckbox, newBox: ParsedCheckbox) => {
    unmatchedOld.delete(oldBox.index)
    unmatchedNew.delete(newBox.index)
    matched.push({ oldBox, newBox })
  }

  for (const newBox of newBoxes) {
    const oldBox = oldBoxes.find(box =>
      unmatchedOld.has(box.index)
      && box.text === newBox.text
      && box.checked === newBox.checked,
    )
    if (oldBox) match(oldBox, newBox)
  }

  // 完了状態だけの変更は、位置が動いても同じタイトルで対応させる。
  for (const newBox of newBoxes) {
    const oldBox = oldBoxes.find(box =>
      unmatchedOld.has(box.index)
      && unmatchedNew.has(newBox.index)
      && box.text === newBox.text,
    )
    if (oldBox) match(oldBox, newBox)
  }

  // 追加・削除がない残りは内容編集とみなし、同じ位置を優先して1対1対応させる。
  if (unmatchedOld.size === unmatchedNew.size) {
    for (const newBox of newBoxes) {
      if (!unmatchedNew.has(newBox.index)) continue
      const oldBox = oldBoxes.find(box => unmatchedOld.has(box.index) && box.index === newBox.index)
      if (oldBox) match(oldBox, newBox)
    }
    const remainingOld = oldBoxes.filter(box => unmatchedOld.has(box.index))
    const remainingNew = newBoxes.filter(box => unmatchedNew.has(box.index))
    remainingOld.forEach((oldBox, index) => match(oldBox, remainingNew[index]!))
  }

  return {
    matched,
    added: newBoxes.filter(box => unmatchedNew.has(box.index)),
    removed: oldBoxes.filter(box => unmatchedOld.has(box.index)),
  }
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
