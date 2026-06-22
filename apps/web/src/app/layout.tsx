// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AccentColorProvider } from '@/components/accent-color-provider'
import { QueryProvider } from '@/components/query-provider'
import { Toaster } from '@/components/app/toaster'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import { ThemeCookieSync } from '@/components/theme-cookie-sync'
import { DynamicAppleTouchIcon } from '@/components/dynamic-apple-touch-icon'
import { DynamicFavicon } from '@/components/dynamic-favicon'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-noto' })

export const metadata: Metadata = {
  title: 'Cairn',
  description: 'プロジェクト管理・チャット・カレンダー・ギャラリー・AIを統合したコラボレーションアプリ',
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F8EF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1622' },
  ],
  // iOS Safari で input/textarea フォーカス時の自動ズームを防ぐ
  maximumScale: 1,
  // Android Chrome / WebView: ソフトキーボード表示時にレイアウトビューポートを縮める。
  // これによりチャット入力欄が常にキーボード直上に来る（iOS は対応外。useKeyboardInset で別途補正する）
  interactiveWidget: 'resizes-content',
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
          <AccentColorProvider>
            <QueryProvider>{children}</QueryProvider>
            <ThemeCookieSync />
            <DynamicAppleTouchIcon />
            <DynamicFavicon />
          </AccentColorProvider>
          <Toaster />
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
