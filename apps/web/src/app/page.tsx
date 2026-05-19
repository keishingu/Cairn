// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { PCApp } from '@/components/app/pc-app'

export default function HomePage() {
  return (
    <div className="app-root" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <PCApp theme="light"/>
    </div>
  )
}
