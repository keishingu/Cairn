// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 動画添付の再生用の圧縮版（長辺 1280px・H.264 / AAC の MP4）を作るための、DB・Sandbox に依存しない部分。
// 全員は圧縮版を再生・保存し、原本のダウンロードは Solo 支援者本人だけにする。
// 変換中・失敗・変換環境のないセルフホストでは、全員が原本で再生する。

export type VideoTranscodeStatus = 'pending' | 'processing' | 'ready' | 'failed'

export const VIDEO_TRANSCODE_STATUS_KEY = 'videoTranscodeStatus'

/** 圧縮版の長辺（720p 相当）。これ以下の動画は解像度を変えず H.264 / AAC に揃えるだけ */
export const VIDEO_DERIVED_MAX_DIMENSION = 1280

/** 変換を動かす Vercel Sandbox のリージョン。原本のある Supabase（東京）の近くに置く */
export const VIDEO_TRANSCODE_REGION = 'hnd1'

/**
 * Vercel Sandbox を使えるか。Vercel 上では OIDC で認証され、それ以外ではアクセストークン一式が要る。
 * 使えない環境（セルフホスト・ローカル）では圧縮版を作らず、原本で再生する
 */
export function isVideoTranscodeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  if (env['VERCEL'] === '1' || env['VERCEL_OIDC_TOKEN']) return true
  return Boolean(env['VERCEL_TOKEN'] && env['VERCEL_TEAM_ID'] && env['VERCEL_PROJECT_ID'])
}

export function readVideoTranscodeStatus(metadata: unknown): VideoTranscodeStatus | null {
  if (!metadata || typeof metadata !== 'object') return null
  const status = (metadata as Record<string, unknown>)[VIDEO_TRANSCODE_STATUS_KEY]
  return status === 'pending' || status === 'processing' || status === 'ready' || status === 'failed'
    ? status
    : null
}

/** 原本と同じ `{workspaceId}/{channelId}/{userId}/videos/` 配下（chat-videos バケット）に置く */
export function derivedVideoStoragePath(originalStoragePath: string, fileId: string): string {
  const [workspaceId, channelId, userId] = originalStoragePath.split('/')
  if (!workspaceId || !channelId || !userId) throw new Error(`Unexpected video storage path: ${originalStoragePath}`)
  return `${workspaceId}/${channelId}/${userId}/videos/derived/${fileId}.mp4`
}

/** 圧縮版を保存するときのファイル名（拡張子だけ .mp4 にする） */
export function derivedVideoFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  return `${stem}.mp4`
}

export interface VideoPlaybackSource {
  storagePath: string
  /** 保存時のファイル名 */
  downloadName: string
  variant: 'derived' | 'original'
}

/** 再生・通常の保存で返すもの。圧縮版ができていればそれ、なければ原本 */
export function resolveVideoPlaybackSource(file: {
  fileName: string
  storagePath: string
  derivedStoragePath: string | null
  metadata: unknown
}): VideoPlaybackSource {
  if (readVideoTranscodeStatus(file.metadata) === 'ready' && file.derivedStoragePath) {
    return {
      storagePath: file.derivedStoragePath,
      downloadName: derivedVideoFileName(file.fileName),
      variant: 'derived',
    }
  }
  return { storagePath: file.storagePath, downloadName: file.fileName, variant: 'original' }
}

/**
 * Sandbox 内で動かすスクリプト。署名 URL は環境変数で渡し、ログに出さない。
 * - スマホの縦動画も回転を反映し（ffmpeg の既定）、長辺 1280px の枠に収める
 * - 音声が無い動画も通るよう、音声は有れば使う（0:a:0?）
 * - 再生開始を早めるため moov を先頭へ置く（+faststart）
 */
export function buildTranscodeScript(): string {
  const max = VIDEO_DERIVED_MAX_DIMENSION
  return [
    'set -euo pipefail',
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get update -qq',
    'apt-get install -y -qq --no-install-recommends ffmpeg curl ca-certificates > /dev/null',
    'workdir=$(mktemp -d)',
    'cd "$workdir"',
    'curl -fsS --retry 3 -o input "$SOURCE_URL"',
    [
      'ffmpeg -nostdin -hide_banner -loglevel error -y -i input',
      '-map 0:v:0 -map 0:a:0?',
      `-vf "scale=w='min(${max},iw)':h='min(${max},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"`,
      '-c:v libx264 -preset veryfast -crf 23 -maxrate 2500k -bufsize 5000k -profile:v high',
      '-c:a aac -b:a 128k -ac 2',
      '-movflags +faststart output.mp4',
    ].join(' '),
    'curl -fsS --retry 3 -X PUT -H "content-type: video/mp4" -H "x-upsert: true" --upload-file output.mp4 "$UPLOAD_URL" > /dev/null',
  ].join('\n')
}
