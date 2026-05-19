import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    // pnpm workspace の tsconfig 参照を Vite が解決できないため inline で指定
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2022',
        strict: true,
        moduleResolution: 'bundler',
        esModuleInterop: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
