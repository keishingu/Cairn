import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const envSource = readFileSync(new URL('./env.ts', import.meta.url), 'utf8')
const supabaseSource = readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8')

describe('Expo公開環境変数', () => {
  it('Metroが埋め込める静的なドット記法で参照する', () => {
    expect(envSource).toContain('process.env.EXPO_PUBLIC_SUPABASE_URL')
    expect(envSource).toContain('process.env.EXPO_PUBLIC_API_BASE_URL')
    expect(supabaseSource).toContain('process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY')

    expect(envSource).not.toMatch(/process\.env\[['"]EXPO_PUBLIC_/)
    expect(supabaseSource).not.toMatch(/process\.env\[['"]EXPO_PUBLIC_/)
  })
})
