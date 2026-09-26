// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AccentColorProvider } from '@/components/accent-color-provider'
import { LocaleProvider } from '@/components/locale-provider'
import { QueryProvider } from '@/components/query-provider'
import { Toaster } from '@/components/app/toaster'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import { ThemeCookieSync } from '@/components/theme-cookie-sync'
import { DynamicAppleTouchIcon } from '@/components/dynamic-apple-touch-icon'
import { DynamicFavicon } from '@/components/dynamic-favicon'
import { PostHogProvider } from '@/components/posthog-provider'
import { translate } from '@cairn/shared'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-noto' })

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await readRequestLocale()
  return {
  title: 'Cairn',
  description: translate(locale, 'Chat, projects, calendar, files, gallery, and AI in one place.'),
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Cairn',
  },
  icons: {
    icon: '/favicon.ico',
  },
  }
}

export const viewport: Viewport = {
  // iOS PWA でノッチ・ホームインジケータの領域まで描画し、
  // env(safe-area-inset-*) を使って各UI側で安全な余白を確保する
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F8EF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1622' },
  ],
  // iOS Safari で input/textarea フォーカス時の自動ズームを防ぐ
  maximumScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { locale, preference } = await readRequestLocale()
  const isMobile = (await headers()).get('x-device') === 'mobile'
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} ${notoSansJP.variable}`} style={{ margin: 0, padding: 0, height: '100%' }}>
        <ThemeProvider attribute={['class', 'data-theme']} defaultTheme="system" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <AccentColorProvider>
              <LocaleProvider initialLocale={locale} initialPreference={preference}>
              <QueryProvider>{children}</QueryProvider>
              </LocaleProvider>
              <ThemeCookieSync />
              <DynamicAppleTouchIcon />
              <DynamicFavicon />
            </AccentColorProvider>
          </PostHogProvider>
          <Toaster placement={isMobile ? 'top' : 'bottom-right'} />
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
