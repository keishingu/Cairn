// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AccentColorProvider } from '@/components/accent-color-provider'
import { QueryProvider } from '@/components/query-provider'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-noto' })

export const metadata: Metadata = {
  title: 'Cairn',
  description: 'プロジェクト管理・チャット・カレンダー・ギャラリー・AIを統合したコラボレーションアプリ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Cairn',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F8EF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1622' },
  ],
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
          </AccentColorProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
