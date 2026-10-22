// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { cardActionErrorMessage, normalizeMessageBlocks, parseMrkdwn, type RenderBlock, type RenderConfirm, type RenderContextElement, type RenderElement } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Modal } from '@/components/app/primitives'
import { MarkdownContent } from '@/components/app/markdown-content'
import { MrkdwnView, RenderTextView } from './mrkdwn-view'

// アプリが投稿したカード（Block Kit サブセット）を描く。中間表現への変換は packages/shared の normalizeMessageBlocks が持ち、
// ここは部品への写像だけにする（ネイティブの描画と解釈をずらさないため。docs/app-platform-design.md §4.3）

/** 押下されたボタン・選ばれた選択肢。インタラクションの送信（実装順5）で使う */
export type CardAction =
  | { type: 'button'; blockId: string; actionId: string }
  | { type: 'static_select'; blockId: string; actionId: string; selectedOptionValue: string }

/**
 * カードの操作を送る。届いたら true、失敗したら false（選択肢の表示を元に戻すため）。
 * link は URL ボタンの押下の通知（Slack と同じく block_actions を送る）。リンクは開いた後なので、カードの書き換えを待たない
 */
type CardRun = (action: CardAction, options?: { link?: boolean }) => Promise<boolean>

/** 操作が届いた後、アプリのカードの書き換えを待つ上限 */
const CARD_UPDATE_WAIT_MS = 8000

type MessageCardProps = {
  blocks: unknown
  /** messages.content（Slack の text）。カードが何も描けないときに代わりに出す */
  fallbackText: string
  mentionNames?: Map<string, string> | undefined
  /**
   * 未指定なら操作できない表示にする（閲覧専用の場面のため）。Promise を返したら終わるまでカードの操作を止め、
   * 失敗したらカードの下にエラーを出す（黙って元に戻さない）。エラーに code があれば案内文に変える
   */
  onAction?: ((action: CardAction) => void | Promise<void>) | undefined
  /** カードの版。見えないボタンの value だけの書き換えでは blocks が変わらないので、これでも書き換えの到着を知る */
  revision?: string | null | undefined
}

export const MessageCard = React.memo(function MessageCard({ blocks, fallbackText, mentionNames, onAction, revision }: MessageCardProps) {
  const t = useT()
  const card = React.useMemo(() => normalizeMessageBlocks(blocks), [blocks])
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const waitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopWaiting = React.useCallback(() => {
    if (waitTimer.current) clearTimeout(waitTimer.current)
    waitTimer.current = null
    setBusy(false)
  }, [])
  // アプリが chat.update でカードを書き換えたら（blocks が変わる）、待つのをやめて新しいカードを操作できるようにする
  // カードの書き換えのたびに進む。書き換え前に始めた操作の結果（遅れて届く時間切れなど）を、新しいカードに出さない
  const generation = React.useRef(0)
  React.useEffect(() => {
    generation.current += 1
    stopWaiting()
    // 前の操作のエラー（時間切れなど）も消す。アプリは処理していて結果のカードが届いたのに「もう一度」と案内して二重に押させない
    setActionError(null)
  }, [blocks, revision, stopWaiting])
  React.useEffect(() => () => { if (waitTimer.current) clearTimeout(waitTimer.current) }, [])
  const run = React.useMemo<CardRun | undefined>(() => {
    if (!onAction) return undefined
    return async (action: CardAction, options?: { link?: boolean }) => {
      const startedAt = generation.current
      const superseded = () => generation.current !== startedAt
      if (options?.link) {
        setActionError(null)
        try {
          await onAction(action)
          return true
        } catch (err) {
          if (superseded()) return true
          const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : null
          setActionError(t(cardActionErrorMessage(code)))
          return false
        }
      }
      setBusy(true)
      setActionError(null)
      try {
        await onAction(action)
      } catch (err) {
        // 失敗が届く前にカードが書き換わっていたら、アプリは処理している。古いエラーで押し直しを促さない
        if (superseded()) return true
        const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : null
        setActionError(t(cardActionErrorMessage(code)))
        stopWaiting()
        return false
      }
      if (superseded()) return true
      // アプリは先に応答してから chat.update することが多い。古いカードで続けて押させず、書き換えが届くまで止めておく。
      // カードを書き換えない操作（モーダルを開くだけ等）で止まったままにならないよう、一定時間で戻す
      if (waitTimer.current) clearTimeout(waitTimer.current)
      waitTimer.current = setTimeout(stopWaiting, CARD_UPDATE_WAIT_MS)
      return true
    }
  }, [onAction, t, stopWaiting])

  if (card.nothingRenderable) {
    return (
      <div>
        {fallbackText && <MrkdwnView blocks={parseMrkdwn(fallbackText)} mentionNames={mentionNames} />}
        <UnsupportedNotice>{t('This card cannot be shown in this version. Reload the page to see it.')}</UnsupportedNotice>
      </div>
    )
  }

  return (
    <div aria-busy={busy} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 600 }}>
      {card.blocks.map((block) => (
        // 送信中は同じカードの操作を止め、二重に押させない
        // URL ボタンの押下の通知は、ほかの操作の送信中・書き換え待ちでも送る（リンクは常に開けるため）
        <CardBlock key={block.blockId} block={block} mentionNames={mentionNames} onAction={busy ? undefined : run} onLinkAction={run} />
      ))}
      {actionError && <div role="alert" style={{ fontSize: 12, color: 'var(--red-text)' }}>{actionError}</div>}
    </div>
  )
})

/** モーダルの中の入力欄以外のブロックも同じ見た目で描くため、外から使えるようにする */
export function CardBlock({ block, mentionNames, onAction, onLinkAction }: { block: RenderBlock; mentionNames?: Map<string, string> | undefined; onAction?: CardRun | undefined; onLinkAction?: CardRun | undefined }) {
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
          {block.accessory && <div style={{ flexShrink: 0 }}><CardElement element={block.accessory} blockId={block.blockId} mentionNames={mentionNames} onAction={onAction} onLinkAction={onLinkAction} /></div>}
        </div>
      )
    case 'actions':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {block.elements.map((element, index) => <CardElement key={index} element={element} blockId={block.blockId} mentionNames={mentionNames} onAction={onAction} onLinkAction={onLinkAction} />)}
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
    case 'markdown':
      // 普段のメッセージと同じ部品で描く（Mermaid も図になる）。外部から届いた本文なので画像とリンクは制限する
      return <div style={{ fontSize: 13.5, color: 'var(--text)', minWidth: 0 }}><MarkdownContent content={block.text} mentionNames={mentionNames} external /></div>
    case 'unsupported':
      return <UnsupportedPart />
  }
}

function CardElement({ element, blockId, mentionNames, onAction, onLinkAction }: { element: RenderElement; blockId: string; mentionNames?: Map<string, string> | undefined; onAction?: CardRun | undefined; onLinkAction?: CardRun | undefined }) {
  switch (element.type) {
    case 'button': {
      const className = ['btn', 'btn-sm', element.style === 'primary' ? 'btn-primary' : element.style === 'danger' ? 'btn-danger' : ''].filter(Boolean).join(' ')
      // URL ボタンはリンクとして開き、Slack と同じく押下もアプリへ知らせる（block_actions）
      const action = { type: 'button' as const, blockId, actionId: element.actionId }
      const notifyLink = () => { void (onLinkAction ?? onAction)?.(action, { link: true }) }
      const activate = element.url
        ? () => { window.open(element.url, '_blank', 'noopener,noreferrer'); notifyLink() }
        : () => { void onAction?.(action) }
      return (
        <ConfirmGate confirm={element.confirm} mentionNames={mentionNames} onConfirmed={activate}>
          {(request) => element.url && !element.confirm ? (
            <a className={className} href={element.url} target="_blank" rel="noopener noreferrer" onClick={notifyLink}>{element.text}</a>
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

function CardSelect({ element, blockId, mentionNames, onAction }: { element: Extract<RenderElement, { type: 'static_select' }>; blockId: string; mentionNames?: Map<string, string> | undefined; onAction?: CardRun | undefined }) {
  const t = useT()
  const [value, setValue] = React.useState(element.initialValue ?? '')
  const [pending, setPending] = React.useState<string | null>(null)
  const commit = async (next: string) => {
    const previous = value
    setValue(next)
    // 届かなかった選択を、選んだまま見せない（アプリは受け取っていない）
    if ((await onAction?.({ type: 'static_select', blockId, actionId: element.actionId, selectedOptionValue: next })) === false) setValue(previous)
  }
  return (
    <>
      <select
        aria-label={element.placeholder ?? t('Choose an option')}
        disabled={!onAction}
        value={value}
        onChange={(event) => (element.confirm ? setPending(event.target.value) : void commit(event.target.value))}
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
        <CardConfirmDialog confirm={element.confirm} mentionNames={mentionNames} onConfirm={() => { void commit(pending); setPending(null) }} onClose={() => setPending(null)} />
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
    case 'meter':
      return <CardMeter meter={element} />
    case 'unsupported':
      return <UnsupportedPart />
  }
}

/**
 * 量を表すバー。<meter> は既定の見た目がブラウザごとに違い、テーマ色にも合わせにくいため、
 * 意味は role="meter" と aria-value* で伝え、見た目は div で描く
 */
function CardMeter({ meter }: { meter: Extract<RenderContextElement, { type: 'meter' }> }) {
  const ratio = Math.min(1, Math.max(0, (meter.value - meter.min) / (meter.max - meter.min)))
  return (
    <span
      role="meter"
      aria-valuenow={meter.value}
      aria-valuemin={meter.min}
      aria-valuemax={meter.max}
      {...(meter.label ? { 'aria-label': meter.label } : {})}
      style={{ display: 'inline-block', width: 120, height: 8, borderRadius: 999, background: 'var(--border-2)', overflow: 'hidden', flexShrink: 0 }}
    >
      <span style={{ display: 'block', width: `${ratio * 100}%`, height: '100%', borderRadius: 999, background: 'var(--accent)' }} />
    </span>
  )
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
