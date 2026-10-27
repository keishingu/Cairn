// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import styles from '../developers.module.css'
import { DOC_PAGES, docPath } from '../_content/pages'
import type { DocPage, DocsLocale } from './doc'

const COPY = {
  ja: {
    home: 'Cairn ホームへ戻る',
    eyebrow: 'DEVELOPERS · PREVIEW',
    guide: 'ガイド',
    toc: '目次',
    previous: '前へ',
    next: '次へ',
    switchLabel: 'English',
    preview: (
      <>
        <strong>プレビュー版の仕様です。</strong>
        外部の開発者がアプリを登録し Bot トークンを発行する手段はまだ提供していません（現在はファーストパーティのアプリだけが動いています）。登録の開始までに仕様が変わることがあります。
      </>
    ),
    support: 'フィードバック・お問い合わせ',
  },
  en: {
    home: 'Back to the Cairn home page',
    eyebrow: 'DEVELOPERS · PREVIEW',
    guide: 'Guide',
    toc: 'On this page',
    previous: 'Previous',
    next: 'Next',
    switchLabel: '日本語',
    preview: (
      <>
        <strong>This specification is a preview.</strong> External developers cannot register apps or issue bot tokens yet (only first-party apps run
        today). Details may change before registration opens.
      </>
    ),
    support: 'Feedback and support',
  },
} as const

export function DocsPage({ locale, page }: { locale: DocsLocale; page: DocPage }) {
  const copy = COPY[locale]
  const content = page.content[locale]
  const index = DOC_PAGES.indexOf(page)
  const previous = DOC_PAGES[index - 1]
  const next = DOC_PAGES[index + 1]
  const otherLocale: DocsLocale = locale === 'ja' ? 'en' : 'ja'

  return (
    <main className={styles['page']} lang={locale}>
      <header className={styles['header']}>
        <Link className={styles['brand']} href="/" aria-label={copy.home}>
          <span className={styles['mark']} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Cairn <small>Developers</small>
        </Link>
        <nav className={styles['headerNav']} aria-label="Language">
          <Link href={docPath(otherLocale, page.slug)} hrefLang={otherLocale} lang={otherLocale}>
            {copy.switchLabel}
          </Link>
          <a href="https://github.com/keishingu/Cairn" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <div className={styles['layout']}>
        <nav className={styles['sidebar']} aria-label={copy.guide}>
          <p>{copy.guide.toUpperCase()}</p>
          <ul>
            {DOC_PAGES.map((candidate) => (
              <li key={candidate.slug}>
                <Link href={docPath(locale, candidate.slug)} aria-current={candidate === page ? 'page' : undefined}>
                  {candidate.content[locale].title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className={styles['article']}>
          <div className={styles['hero']}>
            <p className={styles['eyebrow']}>{copy.eyebrow}</p>
            <h1>{content.title}</h1>
            <p className={styles['description']}>{content.description}</p>
          </div>

          <p className={styles['preview']}>{copy.preview}</p>

          <nav className={styles['toc']} aria-label={copy.toc}>
            <p>{copy.toc}</p>
            <ol>
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {content.sections.map((section) => (
            <section className={styles['section']} id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              <div className={styles['content']}>{section.content}</div>
            </section>
          ))}

          <nav className={styles['pager']} aria-label={`${copy.previous} / ${copy.next}`}>
            {previous ? <Link href={docPath(locale, previous.slug)}>← {previous.content[locale].title}</Link> : <span />}
            {next ? <Link href={docPath(locale, next.slug)}>{next.content[locale].title} →</Link> : <span />}
          </nav>
        </article>
      </div>

      <footer className={styles['footer']}>
        <span>© 2026 Cairn Project</span>
        <a href="https://github.com/keishingu/Cairn/issues" target="_blank" rel="noreferrer">
          {copy.support}
        </a>
      </footer>
    </main>
  )
}
