// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type WorkspaceState = 'unlimited' | 'funded' | 'weathered'

export const placementEligibleCreditReasons = ['subscription_grant', 'pack_purchase'] as const

export type PlacementEligibleCreditReason = (typeof placementEligibleCreditReasons)[number]

// 確定済みの付与行だけを配置可能な単位として扱う。
// 消費・家賃・調整の行を誤って配置対象に含めないため、DB 依存なしで判定する。
export function isPlacementEligibleCredit(input: { reason: string; delta: number }): boolean {
  return input.delta > 0 && placementEligibleCreditReasons.includes(
    input.reason as PlacementEligibleCreditReason,
  )
}

export interface UploadRights {
  canUploadOriginal: boolean
  canUploadLargeFile: boolean
  canUploadVideo: boolean
}

/**
 * 課金の有効・残高から、ワークスペースが提供する受動恩恵の状態を解決する。
 * セルフホストでは課金を完全に無効化し、残高によらず無制限として扱う。
 */
export function resolveWorkspaceState(
  creditBalance: number,
  billingEnabled: boolean,
): WorkspaceState {
  if (!billingEnabled) return 'unlimited'
  return creditBalance > 0 ? 'funded' : 'weathered'
}

/**
 * 原本・動画・大容量ファイルのアップロード権を解決する。
 * 圧縮画像および無料枠内の文書はこの関数の対象外であり、常に既存の通常フローで扱う。
 */
export function resolveUploadRights(
  isActiveSupporter: boolean,
  workspaceFunded: boolean,
  billingEnabled: boolean,
): UploadRights {
  const canUploadPaidStorage = !billingEnabled || (isActiveSupporter && workspaceFunded)

  return {
    canUploadOriginal: canUploadPaidStorage,
    canUploadLargeFile: canUploadPaidStorage,
    canUploadVideo: canUploadPaidStorage,
  }
}
