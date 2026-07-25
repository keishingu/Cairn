// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Web から参照する純粋な課金ドメインの専用エントリーポイント。
// application/ の Node.js 向け use case を解決しないため、Next.js のバンドルにも安全に渡せる。
export {
  resolveUploadRights,
  resolveWorkspaceState,
  type UploadRights,
  type WorkspaceState,
} from './domain/billing'
export { BILLING_CONFIG, BYTES_PER_GIB } from './domain/billing-config'
export {
  calculateStorageRentAccrual,
  settleStorageRent,
  type StorageRentSettlement,
} from './domain/storage-rent'
