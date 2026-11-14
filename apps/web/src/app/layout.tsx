// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AccentColorProvider } from '@/components/accent-color-provider'
import { LocaleProvider } from '@/components/locale-provider'
import { QueryProvider } from '@/components/query-provider'
import { RootToaster } from '@/components/root-toaster'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import { ThemeCookieSync } from '@/components/theme-cookie-sync'
import { DynamicAppleTouchIcon } from '@/components/dynamic-apple-touch-icon'
import { DynamicFavicon } from '@/components/dynamic-favicon'
import { DesktopAppIconSync } from '@/components/desktop-app-icon-sync'
import { PostHogProvider } from '@/components/posthog-provider'
import { translate } from '@cairn/shared'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-noto' })

// cookies() / headers() をここで呼ぶと、配下の公開ページ（開発者ドキュメント・規約）まで動的になる。
// 説明文は製品の既定言語。画面の言語は LocaleProvider が描画前に cookie と navigator.languages で決める。
export const metadata: Metadata = {
  title: 'Cairn',
  description: translate('ja', 'Chat, projects, calendar, files, gallery, and AI in one place.'),
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Cairn',
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  // iOS PWA でノッチ・ホームインジケータの領域まで描画し、
  // env(safe-area-inset-*) を使って各UI側で安全な余白を確保する
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0F14' },
  ],
  // iOS Safari で input/textarea フォーカス時の自動ズームを防ぐ
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${inter.variable} ${notoSansJP.variable}`} style={{ margin: 0, padding: 0, height: '100%' }}>
        <ThemeProvider attribute={['class', 'data-theme']} defaultTheme="system" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <AccentColorProvider>
              <LocaleProvider initialLocale="ja" initialPreference="system" syncFromBrowser>
              <QueryProvider>{children}</QueryProvider>
              <RootToaster />
              </LocaleProvider>
              <ThemeCookieSync />
              <DynamicAppleTouchIcon />
              <DynamicFavicon />
              <DesktopAppIconSync />
            </AccentColorProvider>
          </PostHogProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
