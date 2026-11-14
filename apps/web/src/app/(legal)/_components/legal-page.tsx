// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react'
import Link from 'next/link'
import styles from '../legal.module.css'

interface LegalSection {
  id: string
  title: string
  content: ReactNode
}

interface LegalPageProps {
  title: string
  description: string
  updatedAt: string
  sections: LegalSection[]
}

export function LegalPage({ title, description, updatedAt, sections }: LegalPageProps) {
  return (
    <main className={styles['page']}>
      <header className={styles['header']}>
        <Link className={styles['brand']} href="/" aria-label="Cairn ホームへ戻る">
          <span className={styles['mark']} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Cairn
        </Link>
        <nav className={styles['nav']} aria-label="法務情報">
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/terms">利用規約</Link>
        </nav>
      </header>

      <article className={styles['article']}>
        <div className={styles['hero']}>
          <p className={styles['eyebrow']}>LEGAL</p>
          <h1>{title}</h1>
          <p className={styles['description']}>{description}</p>
          <p className={styles['updated']}>最終更新日: {updatedAt}</p>
        </div>

        <nav className={styles['toc']} aria-label="ページ内目次">
          <p>目次</p>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={styles['sections']}>
          {sections.map((section, index) => (
            <section id={section.id} key={section.id}>
              <h2>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {section.title}
              </h2>
              <div className={styles['content']}>{section.content}</div>
            </section>
          ))}
        </div>
      </article>

      <footer className={styles['footer']}>
        <span>© 2026 Cairn Project</span>
        <a href="https://github.com/keishingu/Cairn/issues" target="_blank" rel="noreferrer">
          サポート・お問い合わせ
        </a>
      </footer>
    </main>
  )
}
