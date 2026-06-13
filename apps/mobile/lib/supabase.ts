import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'

const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
