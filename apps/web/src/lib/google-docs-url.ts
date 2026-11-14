const GOOGLE_DOCS_URL_RE = /https:\/\/(?:docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+(?:\/[^\s]*)*|drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+(?:\/[^\s]*)*)/g

export function normalizeGoogleDocsUrl(url: string): string {
  return url.replace(/[\])},.!?;:>、。]+$/u, '')
}

export function extractGoogleDocsUrls(text: string): string[] {
  return [...new Set((text.match(GOOGLE_DOCS_URL_RE) ?? []).map(normalizeGoogleDocsUrl))]
}
