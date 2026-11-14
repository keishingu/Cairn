import { describe, expect, it } from 'vitest'
import { extractGoogleDocsUrls } from './google-docs-url'

describe('extractGoogleDocsUrls', () => {
  it('日本語の句読点をURLに含めない', () => {
    expect(extractGoogleDocsUrls(
      '資料です https://docs.google.com/document/d/doc-1/edit。',
    )).toEqual(['https://docs.google.com/document/d/doc-1/edit'])
  })
})
