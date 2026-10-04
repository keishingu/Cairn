// アバター画像が未設定のときの配色。Web とモバイルで同じ人が同じ色になるよう、名前から決める
export const AVATAR_GRADIENTS = [
  ['#34D399', '#10B981'],
  ['#60A5FA', '#3B82F6'],
  ['#F59E0B', '#F97316'],
  ['#F472B6', '#EC4899'],
  ['#A78BFA', '#7C3AED'],
  ['#FB7185', '#E11D48'],
  ['#22D3EE', '#0891B2'],
  ['#FBBF24', '#D97706'],
] as const satisfies ReadonlyArray<readonly [string, string]>

function hashName(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function avatarGradient(name: string): readonly [string, string] {
  return AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length]!
}

export function avatarInitial(name: string): string {
  return name ? name.replace(/\s/g, '').slice(0, 1).toUpperCase() || '?' : '?'
}
