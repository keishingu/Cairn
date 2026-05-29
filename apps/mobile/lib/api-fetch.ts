import { supabase } from './supabase'

const API_BASE = process.env['EXPO_PUBLIC_API_BASE_URL']!

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}
