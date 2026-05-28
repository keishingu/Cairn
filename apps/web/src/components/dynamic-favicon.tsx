'use client'

import { useEffect } from 'react'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'

export function DynamicFavicon() {
  const { accentId } = useAccentColor()

  useEffect(() => {
    const preset = ACCENT_PRESETS.find(p => p.id === accentId) ?? ACCENT_PRESETS[0]!

    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = size / 512

    ctx.fillStyle = '#0B1622'
    rr(ctx, 0, 0, size, size, 80 * s)
    ctx.fill()

    ctx.fillStyle = preset.swatch
    rr(ctx, 192 * s, 88 * s, 188 * s, 88 * s, 22 * s); ctx.fill()
    rr(ctx, 96 * s, 204 * s, 228 * s, 88 * s, 22 * s); ctx.fill()
    rr(ctx, 112 * s, 320 * s, 296 * s, 92 * s, 22 * s); ctx.fill()

    const url = canvas.toDataURL('image/png')
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-dynamic]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/png'
      link.setAttribute('data-dynamic', '')
      document.head.appendChild(link)
    }
    link.href = url
  }, [accentId])

  return null
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
