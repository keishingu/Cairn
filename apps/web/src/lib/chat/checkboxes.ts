// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const CHECKBOX_RE = /^([-*+] \[)([ x])(\] .*)$/gm

export function toggleCheckboxAt(content: string, checkboxIndex: number, checked: boolean): string {
  let current = 0
  return content.replace(CHECKBOX_RE, (_, before, _state, after) => {
    const isTarget = current === checkboxIndex
    current++
    return `${before}${isTarget ? (checked ? 'x' : ' ') : _state}${after}`
  })
}
