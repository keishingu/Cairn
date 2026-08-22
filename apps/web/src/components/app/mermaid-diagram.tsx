// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useTheme } from 'next-themes'
import { useAccentColor } from '@/components/accent-color-provider'

interface MermaidDiagramProps {
  definition: string
}

interface DiagramState {
  svg: string | null
  error: boolean
}

function readThemeColor(element: HTMLElement, property: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim() || fallback
}

export function MermaidDiagram({ definition }: MermaidDiagramProps) {
  const { resolvedTheme } = useTheme()
  const { accentId } = useAccentColor()
  const diagramId = React.useId().replace(/:/g, '')
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [state, setState] = React.useState<DiagramState>({ svg: null, error: false })

  React.useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      setState({ svg: null, error: false })

      try {
        const mermaid = (await import('mermaid')).default
        if (cancelled || !containerRef.current) return

        const surface = containerRef.current
        const dark = resolvedTheme === 'dark'
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          maxTextSize: 20_000,
          maxEdges: 300,
          theme: 'base',
          themeVariables: {
            darkMode: dark,
            background: readThemeColor(surface, '--card', dark ? '#111827' : '#FFFFFF'),
            primaryColor: readThemeColor(surface, '--accent-soft', dark ? '#12352B' : '#ECFDF5'),
            primaryBorderColor: readThemeColor(surface, '--accent', '#10B981'),
            primaryTextColor: readThemeColor(surface, '--text', dark ? '#F9FAFB' : '#0F172A'),
            secondaryColor: readThemeColor(surface, '--card-2', dark ? '#0F1622' : '#F8FAFC'),
            secondaryBorderColor: readThemeColor(
              surface,
              '--border-2',
              dark ? '#374151' : '#CBD5E1',
            ),
            secondaryTextColor: readThemeColor(surface, '--text-2', dark ? '#D1D5DB' : '#334155'),
            tertiaryColor: readThemeColor(surface, '--bg-elev', dark ? '#0F141B' : '#F1F5F9'),
            tertiaryBorderColor: readThemeColor(surface, '--border', dark ? '#1F2937' : '#E2E8F0'),
            tertiaryTextColor: readThemeColor(surface, '--text-2', dark ? '#D1D5DB' : '#334155'),
            lineColor: readThemeColor(surface, '--text-3', dark ? '#9CA3AF' : '#64748B'),
            textColor: readThemeColor(surface, '--text', dark ? '#F9FAFB' : '#0F172A'),
            fontFamily: 'var(--font-inter), var(--font-noto), sans-serif',
          },
          flowchart: { htmlLabels: false, useMaxWidth: true },
        })

        const { svg } = await mermaid.render(`mermaid-${diagramId}`, definition)
        if (!cancelled) setState({ svg, error: false })
      } catch {
        if (!cancelled) setState({ svg: null, error: true })
      }
    }

    void renderDiagram()
    return () => {
      cancelled = true
    }
  }, [accentId, definition, diagramId, resolvedTheme])

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      style={{
        margin: '6px 0',
        padding: state.error ? '10px 12px' : '12px',
        minHeight: state.svg || state.error ? undefined : 96,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflowX: 'auto',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--card-2)',
        color: state.error ? 'var(--red-text)' : 'var(--text-3)',
        fontSize: 12,
      }}
      aria-busy={!state.svg && !state.error}
    >
      {state.svg ? (
        <div
          role="img"
          aria-label="Mermaid図"
          style={{ width: '100%', minWidth: 0 }}
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      ) : state.error ? (
        <div style={{ width: '100%' }}>
          <div style={{ fontWeight: 600 }}>Mermaid図を表示できません</div>
          <details style={{ marginTop: 6, color: 'var(--text-3)' }}>
            <summary style={{ cursor: 'pointer' }}>ソースを確認</summary>
            <pre
              style={{
                margin: '6px 0 0',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              }}
            >
              {definition}
            </pre>
          </details>
        </div>
      ) : (
        <span role="status">図を描画しています...</span>
      )}
    </div>
  )
}
