'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Matter from 'matter-js'
import type {
  CreditContributionsDto,
  CreditPlacementDto,
  PendingCreditDto,
} from '@/app/api/billing/contributions/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

const BOARD_WIDTH = 640
const BOARD_HEIGHT = 360
const STABLE_FOR_MS = 750

export function shouldRefreshContributionsAfterError(status: number): boolean {
  return status === 409
}

type ActivePlacement = {
  body: Matter.Body
  ledgerId: string
  stableSince: number | null
  isPersisting: boolean
}

function colorForLedger(ledgerId: string): string {
  const palette = ['#d39b68', '#b87550', '#a98265', '#cfb27a', '#8f9a87', '#9e7969']
  const total = [...ledgerId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[total % palette.length]!
}

function bodyForPlacement(input: {
  ledgerId: string
  x: number
  y: number
  rotation: number
  isStatic: boolean
}): Matter.Body {
  const sides = 5 + (input.ledgerId.charCodeAt(0) % 3)
  const body = Matter.Bodies.polygon(input.x, input.y, 29, sides, {
    isStatic: input.isStatic,
    restitution: 0.04,
    friction: 0.95,
    frictionAir: 0.025,
    chamfer: { radius: 6 },
    render: {
      fillStyle: colorForLedger(input.ledgerId),
      strokeStyle: '#5c493d',
      lineWidth: 2,
    },
  })
  body.plugin.ledgerId = input.ledgerId
  Matter.Body.setAngle(body, input.rotation)
  return body
}

async function fetchContributions(): Promise<CreditContributionsDto> {
  const response = await fetchWithAuth('/api/billing/contributions')
  if (!response.ok) throw new Error('積み石の取得に失敗しました')
  return response.json() as Promise<CreditContributionsDto>
}

export function CreditPlacementBoard() {
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Matter.Engine | null>(null)
  const activeRef = useRef<ActivePlacement | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [requestDrop, setRequestDrop] = useState<PendingCreditDto | null>(null)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['credit-contributions'],
    queryFn: fetchContributions,
  })

  useEffect(() => {
    if (!containerRef.current || !data?.billingEnabled) return

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.05 } })
    const render = Matter.Render.create({
      element: containerRef.current,
      engine,
      options: {
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio > 1 ? 2 : 1,
      },
    })
    const runner = Matter.Runner.create()
    engineRef.current = engine
    const floor = Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT - 17, BOARD_WIDTH, 34, {
      isStatic: true,
      render: { fillStyle: '#526b52', strokeStyle: '#405642', lineWidth: 1 },
    })
    const leftWall = Matter.Bodies.rectangle(-14, BOARD_HEIGHT / 2, 28, BOARD_HEIGHT, { isStatic: true })
    const rightWall = Matter.Bodies.rectangle(BOARD_WIDTH + 14, BOARD_HEIGHT / 2, 28, BOARD_HEIGHT, { isStatic: true })
    const mouse = Matter.Mouse.create(render.canvas)
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.18, render: { visible: false } },
    })
    render.mouse = mouse
    Matter.Composite.add(engine.world, [floor, leftWall, rightWall, mouseConstraint])
    Matter.Composite.add(
      engine.world,
      data.placements.map((placement) =>
        bodyForPlacement({
          ledgerId: placement.ledgerId,
          x: placement.x * BOARD_WIDTH,
          y: placement.y * BOARD_HEIGHT,
          rotation: placement.rotation,
          isStatic: true,
        }),
      ),
    )

    const persistPlacement = async (body: Matter.Body, ledgerId: string) => {
      setIsSaving(true)
      setActionError(null)
      try {
        const response = await fetchWithAuth('/api/billing/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ledgerId,
            x: body.position.x / BOARD_WIDTH,
            y: body.position.y / BOARD_HEIGHT,
            rotation: body.angle,
            shape: 'regular',
          }),
        })
        const result = (await response.json().catch(() => ({}))) as CreditPlacementDto & { error?: string }
        if (!response.ok) {
          if (shouldRefreshContributionsAfterError(response.status)) {
            await queryClient.invalidateQueries({ queryKey: ['credit-contributions'] })
          }
          throw new Error(result.error ?? '積み石を保存できませんでした')
        }
        await queryClient.invalidateQueries({ queryKey: ['credit-contributions'] })
      } catch (err) {
        Matter.Composite.remove(engine.world, body)
        setActionError(err instanceof Error ? err.message : '積み石を保存できませんでした')
      } finally {
        activeRef.current = null
        setIsSaving(false)
      }
    }

    const onAfterUpdate = () => {
      const active = activeRef.current
      if (!active || active.isPersisting) return
      const { body } = active
      if (body.position.y > BOARD_HEIGHT + 70) {
        Matter.Composite.remove(engine.world, body)
        activeRef.current = null
        setActionError('石が足場の外へ落ちました。もう一度置いてください。')
        return
      }
      const isStable = body.position.y > 60 && body.speed < 0.22 && body.angularSpeed < 0.018
      if (!isStable) {
        active.stableSince = null
        return
      }
      const now = Date.now()
      active.stableSince ??= now
      if (now - active.stableSince < STABLE_FOR_MS) return
      active.isPersisting = true
      Matter.Body.setStatic(body, true)
      void persistPlacement(body, active.ledgerId)
    }

    Matter.Events.on(engine, 'afterUpdate', onAfterUpdate)
    Matter.Render.run(render)
    Matter.Runner.run(runner, engine)

    return () => {
      Matter.Events.off(engine, 'afterUpdate', onAfterUpdate)
      Matter.Render.stop(render)
      Matter.Runner.stop(runner)
      Matter.Composite.clear(engine.world, false)
      Matter.Engine.clear(engine)
      if (engineRef.current === engine) engineRef.current = null
      render.canvas.remove()
      render.textures = {}
    }
  }, [data, queryClient])

  useEffect(() => {
    if (!requestDrop || !data?.billingEnabled || activeRef.current || isSaving) return
    const engine = engineRef.current
    if (!engine) return
    const ledgerId = requestDrop.ledgerId
    const body = bodyForPlacement({
      ledgerId,
      x: BOARD_WIDTH * (0.38 + (ledgerId.charCodeAt(1) % 24) / 100),
      y: 42,
      rotation: ((ledgerId.charCodeAt(2) % 20) - 10) / 100,
      isStatic: false,
    })
    Matter.Composite.add(engine.world, body)
    activeRef.current = { body, ledgerId, stableSince: null, isPersisting: false }
    setActionError(null)
    setRequestDrop(null)
  }, [data?.billingEnabled, isSaving, requestDrop])

  const nextPending = data?.pending[0] ?? null
  const placedCount = data?.placements.length ?? 0

  return (
    <section className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 700 }}>みんなで積む</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
            確定した月次付与・追加購入を、一つずつワークスペースに残します。
          </p>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>積み済み {placedCount} 個</div>
      </div>

      {isLoading ? (
        <div style={{ padding: '36px 0', color: 'var(--text-4)', fontSize: 13 }}>積み石を読み込み中…</div>
      ) : isError ? (
        <div style={{ padding: '20px 0', color: 'var(--red-text)', fontSize: 13 }}>
          ⚠ {error instanceof Error ? error.message : '積み石を取得できませんでした'}
        </div>
      ) : data?.billingEnabled ? (
        <>
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
              marginTop: 16,
              border: '1px solid rgba(80, 105, 83, .35)',
              background:
                'radial-gradient(circle at 78% 17%, rgba(255,244,184,.9) 0 27px, transparent 28px), linear-gradient(#c9d9dd 0%, #e5ece0 62%, #8aa183 62%, #526b52 100%)',
            }}
          >
            <div ref={containerRef} style={{ lineHeight: 0 }} />
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {isSaving
                ? '安定した位置を保存しています…'
                : nextPending
                  ? `未積みの石: ${data.pending.length} 個`
                  : 'いまは未積みの石がありません'}
            </div>
            <button
              className="btn btn-primary"
              style={{ height: 32, fontSize: 12.5 }}
              disabled={!nextPending || isSaving || activeRef.current !== null}
              onClick={() => setRequestDrop(nextPending)}
            >
              {activeRef.current ? '石を置いています…' : '次の石を置く'}
            </button>
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--text-4)', fontSize: 11.5 }}>
            石をドラッグして置くと、静止後に保存されます。足場の外へ落ちた石は保存されません。
          </p>
          {actionError && (
            <p style={{ margin: '10px 0 0', color: 'var(--red-text)', fontSize: 12.5 }}>⚠ {actionError}</p>
          )}
        </>
      ) : null}
    </section>
  )
}
