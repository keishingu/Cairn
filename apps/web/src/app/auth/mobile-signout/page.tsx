'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MobileSignOutPage() {
  useEffect(() => {
    const supabase = createClient()

    void supabase.auth.signOut().finally(() => {
      window.location.replace('/auth/login')
    })
  }, [])

  return null
}
