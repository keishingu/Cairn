// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Toaster, type ToastPlacement } from '@/components/app/toaster'

// Middleware の x-device に依存しない。公開ページでは Middleware 自体が走らない。
function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

export function RootToaster() {
  const [placement, setPlacement] = React.useState<ToastPlacement>('bottom-right')

  React.useLayoutEffect(() => {
    setPlacement(isMobileUserAgent(navigator.userAgent) ? 'top' : 'bottom-right')
  }, [])

  return <Toaster placement={placement} />
}
