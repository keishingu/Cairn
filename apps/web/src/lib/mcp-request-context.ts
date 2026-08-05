// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { AsyncLocalStorage } from 'node:async_hooks'
import type { ApiTokenScope } from './api-tokens'
import type { WorkspaceRole } from './access/membership'

export interface VerifiedMcpRequestCredential {
  rawToken: string
  tokenId: string
  clientId: string
  userId: string
  workspaceId: string
  role: WorkspaceRole
  scope: ApiTokenScope
  expiresAt: Date
}

const verifiedMcpRequest = new AsyncLocalStorage<VerifiedMcpRequestCredential>()

export function runWithVerifiedMcpRequest<T>(
  credential: VerifiedMcpRequestCredential,
  callback: () => T,
): T {
  return verifiedMcpRequest.run(credential, callback)
}

export function getVerifiedMcpRequest(): VerifiedMcpRequestCredential | undefined {
  return verifiedMcpRequest.getStore()
}
