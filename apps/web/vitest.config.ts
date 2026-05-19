import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  esbuild: {
    // pnpm workspace の tsconfig 参照を Vite が解決できないため inline で指定
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2017',
        strict: true,
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    // テスト時はPostCSS処理をスキップ
    postcss: {},
  },
})
