// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

// /ai の入力欄の下に置く、会話ごとのモデルの切り替え。選べるのはワークスペースの owner が許可したモデルだけ。
// 切り替えは以降の依頼から反映され、送信済みのやり取りはそのまま残る

import React from 'react'
import { AI_CHAT_MODEL_LABELS, AI_CHAT_MODELS, type AiChatModel } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { useWorkspaceSettings } from '@/lib/use-workspace-settings'
import { useSetAiConversationModel } from '@/hooks/use-ai-conversations'
import { InlineError } from './inline-error'

/** 会話のモデルを、owner が選べるモデルから外していたら true（その会話からは送れない） */
export function isConversationModelUnavailable(model: AiChatModel, allowedModels: readonly AiChatModel[] | undefined): boolean {
  return allowedModels !== undefined && !allowedModels.includes(model)
}

export function AiModelPicker({
  conversationId,
  model,
  disabled,
}: {
  conversationId: string
  model: AiChatModel
  disabled?: boolean
}) {
  const t = useT()
  const { data: settings } = useWorkspaceSettings()
  const setModel = useSetAiConversationModel(conversationId)
  const allowed = settings?.aiChatAllowedModels
  const credits = settings?.aiChatRequestCredits ?? null
  const unavailable = isConversationModelUnavailable(model, allowed)
  // 選べるモデルを読み込むまでは、今の会話のモデルだけを出す（既定の一覧を許可済みに見せない）
  const options = allowed ? AI_CHAT_MODELS.filter(m => allowed.includes(m) || m === model) : [model]
  const label = (m: AiChatModel) => {
    const name = AI_CHAT_MODEL_LABELS[m]
    if (allowed && !allowed.includes(m)) return t('{model} (unavailable)', { model: name })
    return credits ? t('{model} · {credits} credits', { model: name, credits: credits[m] }) : name
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }}>
        <label htmlFor={`ai-model-${conversationId}`}>{t('Model')}</label>
        <select
          id={`ai-model-${conversationId}`}
          value={model}
          disabled={disabled || setModel.isPending || !allowed}
          onChange={e => setModel.mutate(e.target.value as AiChatModel)}
          className="form-control"
          style={{ height: 26, padding: '0 6px', fontSize: 11.5, width: 'auto' }}
        >
          {options.map(m => (
            <option key={m} value={m} disabled={allowed !== undefined && !allowed.includes(m)}>
              {label(m)}
            </option>
          ))}
        </select>
      </div>
      {unavailable && (
        <InlineError style={{ marginTop: 6 }}>
          {t('The workspace owner no longer allows this model. Choose another model to continue.')}
        </InlineError>
      )}
    </div>
  )
}
