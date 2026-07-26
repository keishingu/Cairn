'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Matter from 'matter-js'
import type {
  CreditContributionsDto,
  CreditPlacementDto,
  PendingCreditDto,
} from '@/app/api/billing/contributions/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

// docs/prototypes/stone-stacking-sandbox.html の検証済み初期値。
// 本番では調整UIを出さず、触感を全ワークスペースで揃える。
const PHYSICS = {
  gravity: 1,
  restitution: 0.04,
  friction: 0.9,
  frictionAir: 0.014,
  grip: 0.14,
  freezeDelay: 800,
  stoneSize: 40,
  sizeJitter: 0.3,
} as const

const STAGE_MIN_HEIGHT = 360
const STAGE_MAX_HEIGHT = 620
const WORLD_WIDTH = 640
const WORLD_HEIGHT = 360

type WorkspaceState = 'funded' | 'weathered' | 'unlimited'
type StoneKind = 'stone' | 'flat'

type StoneSpec = {
  kind: StoneKind
  r: number
  seed: number
  hue: number
  sat: number
}

type ActivePlacement = {
  body: Matter.Body
  ledgerId: string
  stableSince: number | null
  isPersisting: boolean
}

type HeldStone = {
  body: Matter.Body
  constraint: Matter.Constraint
  pointerId: number
}

type Scene = (typeof SCENES)[keyof typeof SCENES]

const SCENES = {
  day: {
    skyTop: '#c7dcd4',
    skyBottom: '#efeee1',
    sun: 'rgba(255,246,214,0.55)',
    ridges: ['#aec5ba', '#8fac9f', '#739483'],
    ground: '#a79c82',
    groundDark: '#8f8468',
    grassLine: '#6e8a62',
    blade: '#5f7d55',
    stoneL: 64,
    stoneS: 20,
    outlineA: 0.25,
    cloud: 'rgba(255,255,255,0.5)',
  },
  night: {
    skyTop: '#0e1620',
    skyBottom: '#1b2a2c',
    sun: 'rgba(225,235,244,0.5)',
    ridges: ['#1f2d2f', '#182527', '#121d1e'],
    ground: '#2a2620',
    groundDark: '#201d18',
    grassLine: '#31402c',
    blade: '#3d5237',
    stoneL: 50,
    stoneS: 16,
    outlineA: 0.4,
    cloud: 'rgba(255,255,255,0.06)',
  },
} as const

type ScenicState = {
  ridgePaths: Array<Array<[number, number]>>
  blades: Array<{ x: number; h: number; phase: number }>
  stars: Array<{ x: number; y: number; r: number; tw: number }>
  clouds: Array<{ x: number; y: number; s: number; v: number }>
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry(seed: number): () => number {
  let value = seed + 0x6d2b79f5
  return () => {
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function convexHull(points: Matter.Vector[]): Matter.Vector[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (origin: Matter.Vector, a: Matter.Vector, b: Matter.Vector) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  const lower: Matter.Vector[] = []
  const upper: Matter.Vector[] = []

  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop()
    lower.push(point)
  }
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function stoneVertices(spec: StoneSpec): Matter.Vector[] {
  const random = mulberry(spec.seed)
  const count = spec.kind === 'flat' ? 10 : 8 + Math.floor(random() * 3)
  const squash = spec.kind === 'flat' ? 0.5 : 0.66 + random() * 0.18
  const vertices: Matter.Vector[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index * Math.PI * 2) / count + random() * 0.25
    const radius = spec.r * (0.82 + random() * 0.36)
    vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * squash })
  }
  return convexHull(vertices)
}

export function stoneSpecForLedgerId(ledgerId: string): StoneSpec {
  const random = mulberry(hashSeed(ledgerId))
  const jitter = 1 + (random() - 0.5) * 2 * PHYSICS.sizeJitter
  return {
    kind: 'stone',
    r: PHYSICS.stoneSize * 0.62 * jitter,
    seed: random() * 100_000,
    hue: 26 + random() * 16,
    sat: 14 + random() * 12,
  }
}

function createStoneBody(spec: StoneSpec, x: number, y: number, isStatic: boolean): Matter.Body {
  const body = Matter.Bodies.fromVertices(
    x,
    y,
    [stoneVertices(spec)],
    {
      isStatic,
      restitution: PHYSICS.restitution,
      friction: PHYSICS.friction,
      frictionStatic: PHYSICS.friction * 1.1,
      frictionAir: PHYSICS.frictionAir,
      density: 0.0022,
    },
    true,
  )
  body.plugin.spec = spec
  body.plugin.still = 0
  body.plugin.settled = false
  body.plugin.lastThud = 0
  return body
}

function createLegacyStoneBody(
  ledgerId: string,
  x: number,
  y: number,
  rotation: number,
): Matter.Body {
  // shape=regular は初期ボードが半径29の正多角形として保存した配置。
  // 新しい有機形状に置き換えると静的な既存スタックの接触関係が壊れるため、
  // 衝突形状をそのまま再現する。
  const sides = 5 + (ledgerId.charCodeAt(0) % 3)
  const spec: StoneSpec = { kind: 'stone', r: 29, seed: 0, hue: 34, sat: 20 }
  const body = Matter.Bodies.polygon(x, y, spec.r, sides, {
    isStatic: true,
    restitution: PHYSICS.restitution,
    friction: 0.95,
    frictionAir: 0.025,
    chamfer: { radius: 6 },
  })
  Matter.Body.setAngle(body, rotation)
  body.plugin.spec = spec
  body.plugin.still = 0
  body.plugin.settled = true
  body.plugin.lastThud = 0
  return body
}

function buildScenery(width: number, height: number, groundY: number): ScenicState {
  const ridgePaths: ScenicState['ridgePaths'] = []
  for (let layer = 0; layer < 3; layer += 1) {
    const points: Array<[number, number]> = []
    const base = groundY - 90 - layer * 70 - height * 0.08
    const amplitude = 26 + layer * 22
    const seed = layer * 37.7
    for (let x = 0; x <= width + 20; x += 20) {
      const y =
        base +
        Math.sin(x * 0.006 + seed) * amplitude +
        Math.sin(x * 0.017 + seed * 2.3) * amplitude * 0.35
      points.push([x, y])
    }
    ridgePaths.push(points)
  }

  const random = mulberry(Math.round(width * 1000 + height))
  return {
    ridgePaths,
    blades: Array.from({ length: Math.round(width / 26) }, () => ({
      x: random() * width,
      h: 7 + random() * 9,
      phase: random() * Math.PI * 2,
    })),
    stars: Array.from({ length: 70 }, () => ({
      x: random() * width,
      y: random() * (groundY - 160),
      r: random() * 1.1 + 0.4,
      tw: random() * Math.PI * 2,
    })),
    clouds: [
      { x: width * 0.22, y: height * 0.18, s: 1, v: 0.06 },
      { x: width * 0.68, y: height * 0.11, s: 0.7, v: 0.045 },
    ],
  }
}

function readDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  if (root.dataset['theme'] === 'dark') return true
  if (root.dataset['theme'] === 'light') return false
  return (
    root.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function clampCoordinate(value: number): number {
  return Math.max(0.03, Math.min(0.97, value))
}

export function toWorldPoint(input: { x: number; y: number; width: number; height: number }) {
  const scale = Math.min(input.width / WORLD_WIDTH, input.height / WORLD_HEIGHT)
  const offsetX = (input.width - WORLD_WIDTH * scale) / 2
  const offsetY = (input.height - WORLD_HEIGHT * scale) / 2
  return {
    x: (input.x - offsetX) / scale,
    y: (input.y - offsetY) / scale,
  }
}

function drawStone(
  context: CanvasRenderingContext2D,
  spec: StoneSpec,
  vertices: Matter.Vector[],
  weatheredAmount: number,
  scene: Scene,
  alpha = 1,
) {
  const hue = spec.hue + (210 - spec.hue) * weatheredAmount
  const saturation =
    Math.max(8, spec.sat + scene.stoneS - 20) * (1 - weatheredAmount) + 5 * weatheredAmount
  const lightness = scene.stoneL + (scene.stoneL - 6 - scene.stoneL) * weatheredAmount
  const gradient = context.createLinearGradient(0, -spec.r, 0, spec.r)
  gradient.addColorStop(0, `hsl(${hue} ${saturation}% ${Math.min(92, lightness + 9)}%)`)
  gradient.addColorStop(1, `hsl(${hue} ${saturation}% ${Math.max(8, lightness - 8)}%)`)

  context.save()
  context.globalAlpha = alpha
  context.fillStyle = gradient
  context.strokeStyle = `hsl(${hue} ${saturation}% ${Math.max(5, lightness - 26)}% / ${scene.outlineA})`
  context.lineWidth = 3
  context.lineJoin = 'round'
  context.beginPath()
  vertices.forEach((vertex, index) => {
    if (index === 0) context.moveTo(vertex.x, vertex.y)
    else context.lineTo(vertex.x, vertex.y)
  })
  context.closePath()
  context.fill()
  context.stroke()
  context.restore()
}

function drawThumbnail(
  canvas: HTMLCanvasElement,
  spec: StoneSpec,
  weathered: boolean,
  dark: boolean,
) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.translate(canvas.width / 2, canvas.height / 2 + 2)
  const scale = 20 / spec.r
  context.scale(scale, scale)
  drawStone(context, spec, stoneVertices(spec), weathered ? 1 : 0, dark ? SCENES.night : SCENES.day)
  context.restore()
}

function StoneThumbnail({
  ledgerId,
  weathered,
  dark,
  disabled,
  onClick,
  onPointerDown,
}: {
  ledgerId: string
  weathered: boolean
  dark: boolean
  disabled: boolean
  onClick: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spec = stoneSpecForLedgerId(ledgerId)

  useEffect(() => {
    if (canvasRef.current) drawThumbnail(canvasRef.current, spec, weathered, dark)
  }, [dark, spec, weathered])

  return (
    <button
      aria-label="つまんで積む"
      className="credit-placement-board__tray-stone"
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      type="button"
    >
      <canvas aria-hidden="true" height="44" ref={canvasRef} width="52" />
    </button>
  )
}

async function fetchContributions(): Promise<CreditContributionsDto> {
  const response = await fetchWithAuth('/api/billing/contributions')
  const result = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? '積み石の取得に失敗しました')
  return result as CreditContributionsDto
}

export function shouldRefreshContributionsAfterError(status: number): boolean {
  return status === 409
}

export function CreditPlacementBoard({
  workspaceState = 'funded',
}: {
  workspaceState?: WorkspaceState
}) {
  const queryClient = useQueryClient()
  const stageWrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const toastRef = useRef<HTMLDivElement>(null)
  const hudCountRef = useRef<HTMLSpanElement>(null)
  const hudHeightRef = useRef<HTMLSpanElement>(null)
  const engineRef = useRef<Matter.Engine | null>(null)
  const activeRef = useRef<ActivePlacement | null>(null)
  const isSavingRef = useRef(false)
  const startFromTrayRef = useRef<
    ((pending: PendingCreditDto, event?: ReactPointerEvent<HTMLButtonElement>) => void) | null
  >(null)
  const weatheredRef = useRef(workspaceState === 'weathered')
  const darkRef = useRef(false)
  const stageHeightRef = useRef(460)
  const [stageHeight, setStageHeight] = useState(460)
  const [isHolding, setIsHolding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['credit-contributions'],
    queryFn: fetchContributions,
  })

  useEffect(() => {
    weatheredRef.current = workspaceState === 'weathered'
  }, [workspaceState])

  useEffect(() => {
    const refreshTheme = () => {
      const nextDark = readDarkMode()
      darkRef.current = nextDark
      setDark(nextDark)
    }
    refreshTheme()
    const observer = new MutationObserver(refreshTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', refreshTheme)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', refreshTheme)
    }
  }, [])

  useEffect(() => {
    const stageWrap = stageWrapRef.current
    const canvas = canvasRef.current
    if (!stageWrap || !canvas || !data?.billingEnabled) return

    const engine = Matter.Engine.create({ gravity: { x: 0, y: PHYSICS.gravity } })
    const runner = Matter.Runner.create()
    let floor: Matter.Body | null = null
    let base: Matter.Body | null = null
    let leftWall: Matter.Body | null = null
    let rightWall: Matter.Body | null = null
    let held: HeldStone | null = null
    let particles: Particle[] = []
    const width = WORLD_WIDTH
    const height = WORLD_HEIGHT
    const hasLegacyPlacements = data.placements.some((placement) => placement.shape === 'regular')
    // 初期ボードの床上端は y=326。既存の静的石と接触関係を保つため維持する。
    const groundY = hasLegacyPlacements ? 326 : height - 46
    let viewportWidth = WORLD_WIDTH
    let viewportHeight = stageHeightRef.current
    const scenery = buildScenery(width, height, groundY)
    let weatheredAmount = weatheredRef.current ? 1 : 0
    let shakeAmplitude = 0
    let frameId = 0
    let toastTimer: ReturnType<typeof setTimeout> | null = null
    let audioContext: AudioContext | null = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engineRef.current = engine

    const showToast = (message: string) => {
      if (!toastRef.current) return
      toastRef.current.textContent = message
      toastRef.current.classList.add('is-visible')
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => toastRef.current?.classList.remove('is-visible'), 1600)
    }

    const updateHud = () => {
      const settled = Matter.Composite.allBodies(engine.world).filter(
        (body) => body.plugin?.settled,
      )
      if (hudCountRef.current) hudCountRef.current.textContent = String(settled.length)
      let top = groundY
      for (const body of settled) {
        for (const vertex of body.vertices) top = Math.min(top, vertex.y)
      }
      if (hudHeightRef.current)
        hudHeightRef.current.textContent = String(
          Math.max(0, Math.round((groundY - 28 - top) * 0.45)),
        )
    }

    const puff = (x: number, y: number, count: number) => {
      const actualCount = reducedMotion ? Math.min(count, 1) : count
      for (let index = 0; index < actualCount; index += 1) {
        particles.push({
          x: x + (Math.random() - 0.5) * 14,
          y,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -0.3 - Math.random() * 0.5,
          r: 1.5 + Math.random() * 2.5,
          life: 1,
        })
      }
    }

    const ensureAudio = () => {
      if (audioContext) {
        if (audioContext.state === 'suspended') void audioContext.resume()
        return
      }
      try {
        audioContext = new AudioContext()
      } catch {
        // 音を再生できない環境でも、物理と保存は継続する。
      }
    }

    const playThud = (volume: number, size: number) => {
      if (!audioContext) return
      const now = audioContext.currentTime
      const frequency =
        Math.max(64, Math.min(170, 190 - size * 1.8)) * (0.94 + Math.random() * 0.12)
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.6, now + 0.11)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.22 * volume, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
      oscillator.connect(gain).connect(audioContext.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.15)
    }

    const removeBoundaries = () => {
      for (const body of [floor, base, leftWall, rightWall]) {
        if (body) Matter.Composite.remove(engine.world, body)
      }
    }

    const placeGround = (includePedestal: boolean) => {
      removeBoundaries()
      const floorHeight = includePedestal ? 60 : 34
      floor = Matter.Bodies.rectangle(
        width / 2,
        groundY + floorHeight / 2,
        width * 3,
        floorHeight,
        {
          isStatic: true,
          friction: 1,
        },
      )
      if (includePedestal) {
        base = createStoneBody(
          { kind: 'flat', r: 56, seed: 4.2, hue: 32, sat: 16 },
          width / 2,
          groundY - 14,
          true,
        )
        base.plugin.isBase = true
      }
      leftWall = Matter.Bodies.rectangle(-14, height / 2, 28, height * 2, { isStatic: true })
      rightWall = Matter.Bodies.rectangle(width + 14, height / 2, 28, height * 2, {
        isStatic: true,
      })
      Matter.Composite.add(engine.world, [floor, leftWall, rightWall])
      if (base) Matter.Composite.add(engine.world, base)
    }

    const resize = () => {
      const nextWidth = Math.max(320, Math.floor(stageWrap.clientWidth))
      const nextHeight = Math.max(
        STAGE_MIN_HEIGHT,
        Math.min(STAGE_MAX_HEIGHT, Math.round(nextWidth * 0.5)),
      )
      viewportWidth = nextWidth
      viewportHeight = nextHeight
      if (stageHeightRef.current !== nextHeight) {
        stageHeightRef.current = nextHeight
        setStageHeight(nextHeight)
      }
      const devicePixelRatio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = viewportWidth * devicePixelRatio
      canvas.height = viewportHeight * devicePixelRatio
      canvas.style.width = `${viewportWidth}px`
      canvas.style.height = `${viewportHeight}px`
    }

    resize()
    // 初期ボードの石は床だけを前提に保存されている。後から台座を差し込むと
    // 静的な既存石と重なって衝突形状を壊すため、legacy stack には台座を追加しない。
    placeGround(!hasLegacyPlacements)
    for (const placement of data.placements) {
      const body =
        placement.shape === 'regular'
          ? createLegacyStoneBody(
              placement.ledgerId,
              placement.x * width,
              placement.y * height,
              placement.rotation,
            )
          : createStoneBody(
              stoneSpecForLedgerId(placement.ledgerId),
              placement.x * width,
              placement.y * height,
              true,
            )
      if (placement.shape === 'organic') Matter.Body.setAngle(body, placement.rotation)
      body.plugin.ledgerId = placement.ledgerId
      body.plugin.settled = true
      Matter.Composite.add(engine.world, body)
    }
    updateHud()

    const persistPlacement = async (body: Matter.Body, ledgerId: string) => {
      isSavingRef.current = true
      setIsSaving(true)
      setActionError(null)
      try {
        const response = await fetchWithAuth('/api/billing/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ledgerId,
            x: clampCoordinate(body.position.x / WORLD_WIDTH),
            y: clampCoordinate(body.position.y / WORLD_HEIGHT),
            rotation: body.angle,
            shape: 'organic',
          }),
        })
        const result = (await response.json().catch(() => ({}))) as CreditPlacementDto & {
          error?: string
        }
        if (!response.ok) {
          if (shouldRefreshContributionsAfterError(response.status)) {
            await queryClient.invalidateQueries({ queryKey: ['credit-contributions'] })
          }
          throw new Error(result.error ?? '積み石を保存できませんでした')
        }
        await queryClient.invalidateQueries({ queryKey: ['credit-contributions'] })
      } catch (cause) {
        Matter.Composite.remove(engine.world, body)
        setActionError(cause instanceof Error ? cause.message : '積み石を保存できませんでした')
        showToast('石は手元に戻った')
      } finally {
        activeRef.current = null
        setIsHolding(false)
        isSavingRef.current = false
        setIsSaving(false)
        updateHud()
      }
    }

    const activeStones = () =>
      Matter.Composite.allBodies(engine.world).filter((body) => !body.isStatic && body.plugin?.spec)

    const release = () => {
      if (!held) return
      Matter.Composite.remove(engine.world, held.constraint)
      held = null
      canvas.classList.remove('is-grabbing')
    }

    const grab = (body: Matter.Body, x: number, y: number, pointerId: number) => {
      ensureAudio()
      const constraint = Matter.Constraint.create({
        pointA: { x, y },
        bodyB: body,
        pointB: { x: 0, y: 0 },
        stiffness: PHYSICS.grip,
        damping: 0.12,
        length: 0,
      })
      Matter.Composite.add(engine.world, constraint)
      held = { body, constraint, pointerId }
      canvas.classList.add('is-grabbing')
    }

    const positionForEvent = (event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
      const rect = canvas.getBoundingClientRect()
      const point = toWorldPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      })
      // レターボックス内の手元の石から始めても、床の下へ生成・拘束しない。
      return {
        x: Math.max(18, Math.min(width - 18, point.x)),
        y: Math.max(18, Math.min(groundY - 40, point.y)),
      }
    }

    const onCanvasPointerDown = (event: PointerEvent) => {
      ensureAudio()
      const point = positionForEvent(event)
      const [hit] = Matter.Query.point(activeStones(), point)
      if (!hit) return
      canvas.setPointerCapture(event.pointerId)
      grab(hit, point.x, point.y, event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!held || event.pointerId !== held.pointerId) return
      const point = positionForEvent(event)
      held.constraint.pointA.x = point.x
      held.constraint.pointA.y = point.y
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!held || event.pointerId !== held.pointerId) return
      release()
    }

    const startFromTray = (
      pending: PendingCreditDto,
      event?: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (activeRef.current || isSavingRef.current) return
      event?.preventDefault()
      ensureAudio()
      const point = event ? positionForEvent(event) : { x: width / 2, y: 30 }
      const body = createStoneBody(stoneSpecForLedgerId(pending.ledgerId), point.x, point.y, false)
      body.plugin.ledgerId = pending.ledgerId
      Matter.Composite.add(engine.world, body)
      activeRef.current = {
        body,
        ledgerId: pending.ledgerId,
        stableSince: null,
        isPersisting: false,
      }
      setIsHolding(true)
      setActionError(null)
      if (event) grab(body, point.x, point.y, event.pointerId)
      else Matter.Body.setVelocity(body, { x: 0, y: 2 })
    }

    startFromTrayRef.current = startFromTray

    const onCollisionStart = (event: Matter.IEventCollision<Matter.Engine>) => {
      const now = performance.now()
      for (const pair of event.pairs) {
        for (const body of [pair.bodyA, pair.bodyB]) {
          const spec = body.plugin?.spec as StoneSpec | undefined
          if (!spec || body.isStatic) continue
          if (body.speed > 1.4 && now - (body.plugin.lastThud ?? 0) > 90) {
            body.plugin.lastThud = now
            const volume = Math.min(1, body.speed / 9)
            playThud(volume, spec.r)
            if (!reducedMotion && body.speed > 5) shakeAmplitude = Math.min(5, body.speed * 0.35)
            puff(body.position.x, body.position.y + spec.r * 0.4, Math.round(2 + volume * 4))
          }
        }
      }
    }

    const onAfterUpdate = () => {
      const active = activeRef.current
      if (!active || active.isPersisting) return
      const { body } = active
      if (
        body.position.y > height + 120 ||
        body.position.x < -140 ||
        body.position.x > width + 140
      ) {
        Matter.Composite.remove(engine.world, body)
        release()
        activeRef.current = null
        setIsHolding(false)
        setActionError('石が足場の外へ落ちました。もう一度置いてください。')
        showToast('石は手元に戻った')
        return
      }
      const stable = body.speed < 0.18 && body.angularSpeed < 0.02
      if (!stable || (held && held.body === body)) {
        active.stableSince = null
        return
      }
      const now = Date.now()
      active.stableSince ??= now
      if (now - active.stableSince < PHYSICS.freezeDelay) return
      active.isPersisting = true
      Matter.Body.setStatic(body, true)
      body.plugin.settled = true
      puff(body.position.x, body.position.y, 3)
      updateHud()
      void persistPlacement(body, active.ledgerId)
    }

    const render = (time: number) => {
      const context = canvas.getContext('2d')
      if (!context) return
      const devicePixelRatio = Math.min(2, window.devicePixelRatio || 1)
      const scene = darkRef.current ? SCENES.night : SCENES.day
      const scale = Math.min(viewportWidth / WORLD_WIDTH, viewportHeight / WORLD_HEIGHT)
      const offsetX = (viewportWidth - WORLD_WIDTH * scale) / 2
      const offsetY = (viewportHeight - WORLD_HEIGHT * scale) / 2
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      context.fillStyle = scene.skyTop
      context.fillRect(0, 0, viewportWidth, viewportHeight)
      context.setTransform(
        devicePixelRatio * scale,
        0,
        0,
        devicePixelRatio * scale,
        devicePixelRatio * offsetX,
        devicePixelRatio * offsetY,
      )
      if (shakeAmplitude > 0.1) {
        context.translate(
          (Math.random() - 0.5) * shakeAmplitude,
          (Math.random() - 0.5) * shakeAmplitude,
        )
        shakeAmplitude *= 0.86
      }
      weatheredAmount += ((weatheredRef.current ? 1 : 0) - weatheredAmount) * 0.06
      const sky = context.createLinearGradient(0, 0, 0, groundY)
      sky.addColorStop(0, scene.skyTop)
      sky.addColorStop(1, scene.skyBottom)
      context.fillStyle = sky
      context.fillRect(-10, -10, width + 20, height + 20)

      context.fillStyle = scene.sun
      context.beginPath()
      context.arc(width * 0.78, height * 0.16, darkRef.current ? 22 : 34, 0, Math.PI * 2)
      context.fill()
      if (darkRef.current) {
        context.fillStyle = '#dfe8ec'
        for (const star of scenery.stars) {
          context.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(time * 0.0004 + star.tw))
          context.fillRect(star.x, star.y, star.r, star.r)
        }
        context.globalAlpha = 1
      } else {
        context.fillStyle = scene.cloud
        for (const cloud of scenery.clouds) {
          cloud.x += reducedMotion ? 0 : cloud.v
          if (cloud.x > width + 90) cloud.x = -90
          for (const { offsetX, offsetY, radius } of [
            { offsetX: 0, offsetY: 0, radius: 30 },
            { offsetX: 24, offsetY: 6, radius: 22 },
            { offsetX: -26, offsetY: 7, radius: 20 },
          ]) {
            context.beginPath()
            context.ellipse(
              cloud.x + offsetX * cloud.s,
              cloud.y + offsetY * cloud.s,
              radius * cloud.s,
              radius * 0.55 * cloud.s,
              0,
              0,
              Math.PI * 2,
            )
            context.fill()
          }
        }
      }

      scenery.ridgePaths.forEach((points, index) => {
        context.fillStyle = scene.ridges[index]!
        context.beginPath()
        context.moveTo(-10, height)
        points.forEach(([x, y]) => context.lineTo(x, y))
        context.lineTo(width + 10, height)
        context.closePath()
        context.fill()
      })
      const ground = context.createLinearGradient(0, groundY, 0, height)
      ground.addColorStop(0, scene.ground)
      ground.addColorStop(1, scene.groundDark)
      context.fillStyle = ground
      context.fillRect(-10, groundY, width + 20, height - groundY + 10)
      context.fillStyle = scene.grassLine
      context.fillRect(-10, groundY - 2, width + 20, 4)
      context.strokeStyle = scene.blade
      context.lineWidth = 1.6
      context.lineCap = 'round'
      const swayAmplitude = reducedMotion ? 0.6 : 2.4
      for (const blade of scenery.blades) {
        const sway = Math.sin(time * 0.0012 + blade.phase) * swayAmplitude
        context.beginPath()
        context.moveTo(blade.x, groundY + 1)
        context.quadraticCurveTo(
          blade.x + sway * 0.4,
          groundY - blade.h * 0.6,
          blade.x + sway,
          groundY - blade.h,
        )
        context.stroke()
      }

      for (const body of Matter.Composite.allBodies(engine.world)) {
        const spec = body.plugin?.spec as StoneSpec | undefined
        if (!spec) continue
        context.save()
        context.translate(body.position.x, body.position.y)
        const relativeVertices = body.vertices.map((vertex) => ({
          x: vertex.x - body.position.x,
          y: vertex.y - body.position.y,
        }))
        drawStone(
          context,
          spec,
          relativeVertices,
          weatheredAmount,
          scene,
          held?.body === body ? 0.92 : 1,
        )
        context.restore()
      }

      if (held) {
        context.strokeStyle = darkRef.current ? 'rgba(230,240,235,0.35)' : 'rgba(40,60,50,0.3)'
        context.setLineDash([3, 5])
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(held.constraint.pointA.x, held.constraint.pointA.y)
        context.lineTo(held.body.position.x, held.body.position.y)
        context.stroke()
        context.setLineDash([])
      }
      context.fillStyle = darkRef.current ? 'rgba(180,180,165,0.5)' : 'rgba(120,110,90,0.4)'
      particles = particles.filter((particle) => particle.life > 0)
      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.01
        particle.life -= 0.03
        context.globalAlpha = Math.max(0, particle.life) * 0.6
        context.beginPath()
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
      frameId = requestAnimationFrame(render)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stageWrap)
    canvas.addEventListener('pointerdown', onCanvasPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', release)
    Matter.Events.on(engine, 'collisionStart', onCollisionStart)
    Matter.Events.on(engine, 'afterUpdate', onAfterUpdate)
    Matter.Runner.run(runner, engine)
    frameId = requestAnimationFrame(render)

    return () => {
      resizeObserver.disconnect()
      canvas.removeEventListener('pointerdown', onCanvasPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', release)
      Matter.Events.off(engine, 'collisionStart', onCollisionStart)
      Matter.Events.off(engine, 'afterUpdate', onAfterUpdate)
      Matter.Runner.stop(runner)
      Matter.Composite.clear(engine.world, false)
      Matter.Engine.clear(engine)
      cancelAnimationFrame(frameId)
      if (toastTimer) clearTimeout(toastTimer)
      if (audioContext) void audioContext.close()
      if (engineRef.current === engine) engineRef.current = null
      activeRef.current = null
      setIsHolding(false)
      startFromTrayRef.current = null
    }
  }, [data, queryClient])

  const pending = data?.pending ?? []
  const activeLedgerId = activeRef.current?.ledgerId
  const visiblePending = pending.filter((item) => item.ledgerId !== activeLedgerId)
  const weathered = workspaceState === 'weathered'
  const startFromTray = (
    pendingItem: PendingCreditDto,
    event?: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    startFromTrayRef.current?.(pendingItem, event)
  }

  return (
    <section className="card credit-placement-board">
      <style>{`
        .credit-placement-board { margin-bottom: 16px; overflow: hidden; padding: 0; }
        .credit-placement-board__header { align-items: flex-start; display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; padding: 20px 20px 14px; }
        .credit-placement-board__title { font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif; font-size: 20px; font-weight: 600; letter-spacing: .06em; margin: 0; }
        .credit-placement-board__subtitle { color: var(--text-3); font-size: 12.5px; margin: 6px 0 0; }
        .credit-placement-board__count { color: var(--text-3); font-variant-numeric: tabular-nums; font-size: 12.5px; padding-top: 4px; }
        .credit-placement-board__stage { border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); min-width: 0; overflow: hidden; position: relative; touch-action: none; }
        .credit-placement-board__stage canvas { cursor: grab; display: block; left: 0; position: absolute; top: 0; }
        .credit-placement-board__stage canvas.is-grabbing { cursor: grabbing; }
        .credit-placement-board__hud { display: flex; gap: 22px; left: 18px; pointer-events: none; position: absolute; top: 14px; }
        .credit-placement-board__stat-key { color: color-mix(in srgb, var(--text-2) 82%, transparent); display: block; font-size: 10px; letter-spacing: .14em; }
        .credit-placement-board__stat-value { color: color-mix(in srgb, var(--text) 92%, transparent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22px; font-variant-numeric: tabular-nums; line-height: 1.2; }
        .credit-placement-board__stat-unit { color: color-mix(in srgb, var(--text-2) 82%, transparent); font-size: 12px; margin-left: 2px; }
        .credit-placement-board__hint { color: color-mix(in srgb, var(--text-2) 85%, transparent); font-size: 11px; line-height: 1.7; margin: 0; max-width: 300px; pointer-events: none; position: absolute; right: 16px; text-align: right; top: 12px; }
        .credit-placement-board__tray { backdrop-filter: blur(4px); background: color-mix(in srgb, var(--card) 82%, transparent); border: 1px solid color-mix(in srgb, var(--line) 85%, transparent); border-radius: 10px; bottom: 12px; left: 14px; padding: 8px 10px 6px; position: absolute; }
        .credit-placement-board__tray-label { color: var(--text-3); display: block; font-size: 10px; letter-spacing: .16em; margin-bottom: 2px; }
        .credit-placement-board__tray-items { align-items: center; display: flex; gap: 2px; min-height: 44px; }
        .credit-placement-board__tray-stone { background: transparent; border: 0; border-radius: 6px; cursor: grab; line-height: 0; padding: 0; touch-action: none; }
        .credit-placement-board__tray-stone:not(:disabled):hover { background: var(--card-2); }
        .credit-placement-board__tray-stone:disabled { cursor: default; opacity: .55; }
        .credit-placement-board__tray-stone:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .credit-placement-board__tray-more { color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; padding: 0 6px; }
        .credit-placement-board__toast { background: color-mix(in srgb, var(--text) 88%, transparent); border-radius: 999px; bottom: 84px; color: var(--bg); font-size: 12px; left: 50%; opacity: 0; padding: 7px 14px; pointer-events: none; position: absolute; transform: translateX(-50%) translateY(6px); transition: opacity .25s, transform .25s; }
        .credit-placement-board__toast.is-visible { opacity: 1; transform: translateX(-50%) translateY(0); }
        .credit-placement-board__footer { align-items: center; display: flex; flex-wrap: wrap; gap: 10px 16px; justify-content: space-between; padding: 13px 20px 18px; }
        .credit-placement-board__status { color: var(--text-3); font-size: 12.5px; }
        .credit-placement-board__note { color: var(--text-4); font-size: 11.5px; margin: 0; padding: 0 20px 18px; }
        .credit-placement-board__error { color: var(--red-text); font-size: 12.5px; margin: 0; padding: 0 20px 18px; }
        @media (max-width: 760px) { .credit-placement-board__hint { display: none; } .credit-placement-board__header { padding: 16px 16px 12px; } .credit-placement-board__footer { padding: 12px 16px 15px; } .credit-placement-board__note, .credit-placement-board__error { padding-left: 16px; padding-right: 16px; } }
      `}</style>
      <header className="credit-placement-board__header">
        <div>
          <h2 className="credit-placement-board__title">みんなで積む</h2>
          <p className="credit-placement-board__subtitle">
            確定した月次付与・追加購入を、一つずつワークスペースに残します。
          </p>
        </div>
        <div className="credit-placement-board__count">
          積み済み {data?.placements.length ?? 0} 個
        </div>
      </header>

      {isLoading ? (
        <div className="credit-placement-board__footer">
          <span className="credit-placement-board__status">積み石を読み込み中…</span>
        </div>
      ) : isError ? (
        <p className="credit-placement-board__error">
          ⚠ {error instanceof Error ? error.message : '積み石を取得できませんでした'}
        </p>
      ) : data?.billingEnabled ? (
        <>
          <div
            className="credit-placement-board__stage"
            ref={stageWrapRef}
            style={{ height: stageHeight }}
          >
            <canvas aria-label="石積みの実験場" ref={canvasRef} role="application" />
            <div className="credit-placement-board__hud">
              <div>
                <span className="credit-placement-board__stat-key">積んだ石</span>
                <span className="credit-placement-board__stat-value" ref={hudCountRef}>
                  0
                </span>
              </div>
              <div>
                <span className="credit-placement-board__stat-key">高さ</span>
                <span className="credit-placement-board__stat-value">
                  <span ref={hudHeightRef}>0</span>
                  <span className="credit-placement-board__stat-unit">cm</span>
                </span>
              </div>
            </div>
            <p className="credit-placement-board__hint">
              手元の石をつまんで、好きな場所へ。
              <br />
              転げ落ちても手元に戻るだけ — 消えません。
            </p>
            <div className="credit-placement-board__tray">
              <span className="credit-placement-board__tray-label">手元の石</span>
              <div className="credit-placement-board__tray-items">
                {visiblePending.slice(0, 10).map((pendingItem) => (
                  <StoneThumbnail
                    dark={dark}
                    disabled={isHolding || isSaving}
                    key={pendingItem.ledgerId}
                    ledgerId={pendingItem.ledgerId}
                    onClick={() => startFromTray(pendingItem)}
                    onPointerDown={(event) => startFromTray(pendingItem, event)}
                    weathered={weathered}
                  />
                ))}
                {visiblePending.length > 10 && (
                  <span className="credit-placement-board__tray-more">
                    +{visiblePending.length - 10}
                  </span>
                )}
                {visiblePending.length === 0 && (
                  <span className="credit-placement-board__tray-more">なし</span>
                )}
              </div>
            </div>
            <div
              aria-live="polite"
              className="credit-placement-board__toast"
              ref={toastRef}
              role="status"
            />
          </div>
          <div className="credit-placement-board__footer">
            <span className="credit-placement-board__status">
              {isSaving
                ? '安定した位置を保存しています…'
                : visiblePending.length
                  ? `未積みの石: ${visiblePending.length} 個`
                  : 'いまは未積みの石がありません'}
            </span>
          </div>
          <p className="credit-placement-board__note">
            石をドラッグして置くと、静止後に保存されます。足場の外へ落ちた石は手元に戻ります。
          </p>
          {actionError && <p className="credit-placement-board__error">⚠ {actionError}</p>}
        </>
      ) : null}
    </section>
  )
}
