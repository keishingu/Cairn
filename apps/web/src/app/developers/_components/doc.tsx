// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react'
import styles from '../developers.module.css'

// ドキュメント本文で使う小さな部品。ページの本文は _content/ に置き、見た目はここと developers.module.css に寄せる

export type DocsLocale = 'ja' | 'en'

export interface DocSection {
  id: string
  title: string
  content: ReactNode
}

export interface DocPageContent {
  title: string
  description: string
  sections: DocSection[]
}

export interface DocPage {
  /** /developers/<slug>。概要ページは空文字 */
  slug: string
  content: Record<DocsLocale, DocPageContent>
}

export function Code({ children }: { children: string }) {
  return (
    <pre>
      <code>{children.replace(/^\n/, '').replace(/\n\s*$/, '')}</code>
    </pre>
  )
}

export function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className={styles['tableWrap']}>
      <table>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <div className={styles['note']}>{children}</div>
}
