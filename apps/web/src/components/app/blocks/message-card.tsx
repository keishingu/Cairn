// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { normalizeMessageBlocks, parseMrkdwn, type RenderBlock, type RenderConfirm, type RenderContextElement, type RenderElement } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Modal } from '@/components/app/primitives'
import { MrkdwnView, RenderTextView } from './mrkdwn-view'

// アプリが投稿したカード（Block Kit サブセット）を描く。中間表現への変換は packages/shared の normalizeMessageBlocks が持ち、
// ここは部品への写像だけにする（ネイティブの描画と解釈をずらさないため。docs/app-platform-design.md §4.3）

/** 押下されたボタン・選ばれた選択肢。インタラクションの送信（実装順5）で使う */
export type CardAction =
  | { type: 'button'; blockId: string; actionId: string }
  | { type: 'static_select'; blockId: string; actionId: string; selectedOptionValue: string }

type MessageCardProps = {
  blocks: unknown
  /** messages.content（Slack の text）。カードが何も描けないときに代わりに出す */
  fallbackText: string
  mentionNames?: Map<string, string> | undefined
  /** 未指定なら操作できない表示にする。インタラクションの送信を実装するまでの間と、閲覧専用の場面のため */
  onAction?: ((action: CardAction) => void) | undefined
}

export const MessageCard = React.memo(function MessageCard({ blocks, fallbackText, mentionNames, onAction }: MessageCardProps) {
  const t = useT()
  const card = React.useMemo(() => normalizeMessageBlocks(blocks), [blocks])

  if (card.nothingRenderable) {
    return (
      <div>
        {fallbackText && <MrkdwnView blocks={parseMrkdwn(fallbackText)} mentionNames={mentionNames} />}
        <UnsupportedNotice>{t('This card cannot be shown in this version. Reload the page to see it.')}</UnsupportedNotice>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 600 }}>
      {card.blocks.map((block) => (
        <CardBlock key={block.blockId} block={block} mentionNames={mentionNames} onAction={onAction} />
      ))}
    </div>
  )
})

function CardBlock({ block, mentionNames, onAction }: { block: RenderBlock; mentionNames?: Map<string, string> | undefined; onAction?: MessageCardProps['onAction'] }) {
  switch (block.type) {
    case 'header':
      return <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{block.text}</div>
    case 'section':
      return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {block.text && <div><RenderTextView text={block.text} mentionNames={mentionNames} /></div>}
            {block.fields.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '6px 16px' }}>
                {block.fields.map((field, index) => <div key={index}><RenderTextView text={field} mentionNames={mentionNames} /></div>)}
              </div>
            )}
          </div>
          {block.accessory && <div style={{ flexShrink: 0 }}><CardElement element={block.accessory} blockId={block.blockId} mentionNames={mentionNames} onAction={onAction} /></div>}
        </div>
      )
    case 'actions':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {block.elements.map((element, index) => <CardElement key={index} element={element} blockId={block.blockId} mentionNames={mentionNames} onAction={onAction} />)}
        </div>
      )
    case 'context':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }}>
          {block.elements.map((element, index) => <ContextElement key={index} element={element} mentionNames={mentionNames} />)}
        </div>
      )
    case 'image':
      return (
        <figure style={{ margin: 0 }}>
          {block.title && <figcaption style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{block.title}</figcaption>}
          <ExternalImage url={block.url} alt={block.alt} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, border: '1px solid var(--border)' }} />
        </figure>
      )
    case 'divider':
      return <hr style={{ border: 'none', borderTop: '1px solid var(--divider)', margin: '2px 0', width: '100%' }} />
    case 'unsupported':
      return <UnsupportedPart />
  }
}

function CardElement({ element, blockId, mentionNames, onAction }: { element: RenderElement; blockId: string; mentionNames?: Map<string, string> | undefined; onAction?: MessageCardProps['onAction'] }) {
  switch (element.type) {
    case 'button': {
      const className = ['btn', 'btn-sm', element.style === 'primary' ? 'btn-primary' : element.style === 'danger' ? 'btn-danger' : ''].filter(Boolean).join(' ')
      // URL ボタンはリンクとして開く。押下の通知（Slack は url ボタンでも block_actions を送る）は実装順5で足す
      const activate = element.url
        ? () => { window.open(element.url, '_blank', 'noopener,noreferrer') }
        : () => onAction?.({ type: 'button', blockId, actionId: element.actionId })
      return (
        <ConfirmGate confirm={element.confirm} mentionNames={mentionNames} onConfirmed={activate}>
          {(request) => element.url && !element.confirm ? (
            <a className={className} href={element.url} target="_blank" rel="noopener noreferrer">{element.text}</a>
          ) : (
            <button type="button" className={className} disabled={!element.url && !onAction} onClick={request}>
              {element.text}
            </button>
          )}
        </ConfirmGate>
      )
    }
    case 'static_select':
      // chat.update で初期選択が変わったら選び直した状態を捨てて新しい初期選択を表示する（key で作り直す）
      return <CardSelect key={element.initialValue ?? ''} element={element} blockId={blockId} mentionNames={mentionNames} onAction={onAction} />
    case 'image':
      return <ExternalImage url={element.url} alt={element.alt} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
    case 'unsupported':
      return <UnsupportedPart />
  }
}

function CardSelect({ element, blockId, mentionNames, onAction }: { element: Extract<RenderElement, { type: 'static_select' }>; blockId: string; mentionNames?: Map<string, string> | undefined; onAction?: MessageCardProps['onAction'] }) {
  const t = useT()
  const [value, setValue] = React.useState(element.initialValue ?? '')
  const [pending, setPending] = React.useState<string | null>(null)
  const commit = (next: string) => {
    setValue(next)
    onAction?.({ type: 'static_select', blockId, actionId: element.actionId, selectedOptionValue: next })
  }
  return (
    <>
      <select
        aria-label={element.placeholder ?? t('Choose an option')}
        disabled={!onAction}
        value={value}
        onChange={(event) => (element.confirm ? setPending(event.target.value) : commit(event.target.value))}
        style={{ height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, padding: '0 8px', maxWidth: 240 }}
      >
        {element.initialValue === undefined && <option value="" disabled>{element.placeholder ?? t('Choose an option')}</option>}
        {/* ブラウザ標準の select は2行を描けないため、説明は選択肢の名前に続けて出す（隠さない） */}
        {element.options.map((option) => (
          <option key={option.value} value={option.value} title={option.description}>
            {option.description ? `${option.text} — ${option.description}` : option.text}
          </option>
        ))}
      </select>
      {element.confirm && pending !== null && (
        <CardConfirmDialog confirm={element.confirm} mentionNames={mentionNames} onConfirm={() => { commit(pending); setPending(null) }} onClose={() => setPending(null)} />
      )}
    </>
  )
}

/** アプリが confirm を指定したら、確認を挟んでから操作する（Slack と同じく確認を飛ばさない） */
function ConfirmGate({ confirm, mentionNames, onConfirmed, children }: { confirm: RenderConfirm | undefined; mentionNames?: Map<string, string> | undefined; onConfirmed: () => void; children: (request: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      {children(() => (confirm ? setOpen(true) : onConfirmed()))}
      {confirm && open && <CardConfirmDialog confirm={confirm} mentionNames={mentionNames} onConfirm={() => { setOpen(false); onConfirmed() }} onClose={() => setOpen(false)} />}
    </>
  )
}

function CardConfirmDialog({ confirm, mentionNames, onConfirm, onClose }: { confirm: RenderConfirm; mentionNames?: Map<string, string> | undefined; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} label={confirm.title} role="alertdialog">
      <div className="card" style={{ width: 380, maxWidth: '90vw', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{confirm.title}</h2>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16, overflowWrap: 'break-word' }}>
          <RenderTextView text={confirm.text} mentionNames={mentionNames} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>{confirm.deny}</button>
          <button type="button" className={`btn ${confirm.style === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirm.confirm}</button>
        </div>
      </div>
    </Modal>
  )
}

function ContextElement({ element, mentionNames }: { element: RenderContextElement; mentionNames?: Map<string, string> | undefined }) {
  switch (element.type) {
    case 'image':
      return <ExternalImage url={element.url} alt={element.alt} style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />
    case 'text':
      return <span><RenderTextView text={element.text} mentionNames={mentionNames} /></span>
    case 'unsupported':
      return <UnsupportedPart />
  }
}

// アプリが指定した外部の画像。閲覧中のページの URL をアプリ側へ渡さない
function ExternalImage({ url, alt, style }: { url: string; alt: string; style: React.CSSProperties }) {
  return <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" style={style} />
}

function UnsupportedPart() {
  const t = useT()
  return <UnsupportedNotice>{t('This part of the card cannot be shown in this version. Reload the page to see it.')}</UnsupportedNotice>
}

function UnsupportedNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" style={{ fontSize: 11.5, color: 'var(--text-3)', border: '1px dashed var(--border-2)', borderRadius: 6, padding: '4px 8px' }}>
      {children}
    </div>
  )
}
