// 不具合の報告で「どのビルドの、どの OTA か」を特定するための表記。Expo の検索には ID の全体が要る。
// ビルド内蔵の JS にも updateId は付くため、OTA かどうかは isEmbeddedLaunch で見分ける
export function formatBuildInfo(info: {
  version: string | null
  buildNumber: string | null
  runtimeVersion: string | null
  updateId: string | null
  isEmbeddedLaunch: boolean
}): string {
  const build = info.buildNumber ? `(${info.buildNumber})` : ''
  const update = info.updateId && !info.isEmbeddedLaunch ? `OTA ${info.updateId}` : 'embedded'
  return [
    [info.version ? `v${info.version}` : '', build].filter(Boolean).join(' '),
    info.runtimeVersion ? `runtime ${info.runtimeVersion}` : '',
    update,
  ]
    .filter(Boolean)
    .join(' · ')
}
