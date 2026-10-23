export interface NativeHeaderDescriptor {
  title: string
  subtitle?: string | undefined
  canGoBack: boolean
}

export function parseNativeHeaderDescriptor(value: unknown): NativeHeaderDescriptor | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as { title?: unknown; subtitle?: unknown; canGoBack?: unknown }
  if (typeof input.title !== 'string' || typeof input.canGoBack !== 'boolean') return null
  if (input.subtitle !== undefined && typeof input.subtitle !== 'string') return null
  return {
    title: input.title,
    canGoBack: input.canGoBack,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
  }
}

export const NATIVE_HEADER_BACK_SCRIPT =
  "window.dispatchEvent(new Event('cairn:native-header-back')); true;"
