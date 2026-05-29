import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env['EXPO_PUBLIC_SUPABASE_URL']!
const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
