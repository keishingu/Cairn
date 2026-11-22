// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { statusColor, type UserStatus } from '@/lib/user-status'

/** アバター右下に重ねるステータスのドット。親を position: relative にして使う */
export const StatusDot = ({ status, size = 10 }: { status: UserStatus | undefined; size?: number }) => (
  <span
    data-testid="status-dot"
    data-status={status}
    style={{
      position: 'absolute', right: -1, bottom: -1, width: size, height: size, borderRadius: '50%',
      background: statusColor(status), border: '2px solid var(--card)', boxSizing: 'content-box',
    }}
  />
)
