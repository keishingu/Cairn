const SHORT_UPDATE_ID_LENGTH = 8

// 不具合の報告で「どのビルドの、どの OTA か」を特定するための 1 行。OTA がなければビルド内蔵の JS で動いている
export function formatBuildInfo(info: {
  version: string | null
  buildNumber: string | null
  runtimeVersion: string | null
  updateId: string | null
}): string {
  const build = info.buildNumber ? `(${info.buildNumber})` : ''
  const update = info.updateId ? `OTA ${info.updateId.slice(0, SHORT_UPDATE_ID_LENGTH)}` : 'embedded'
  return [
    [info.version ? `v${info.version}` : '', build].filter(Boolean).join(' '),
    info.runtimeVersion ? `runtime ${info.runtimeVersion}` : '',
    update,
  ]
    .filter(Boolean)
    .join(' · ')
}
