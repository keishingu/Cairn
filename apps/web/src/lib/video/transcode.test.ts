// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { attachmentBucketForPath } from '@/lib/attachments'
import {
  buildTranscodeScript,
  derivedVideoFileName,
  derivedVideoStoragePath,
  isVideoTranscodeConfigured,
  readVideoTranscodeStatus,
  resolveVideoPlaybackSource,
} from './transcode'

describe('動画の圧縮版', () => {
  it('Vercel 上かアクセストークン一式があるときだけ変換を有効にする', () => {
    expect(isVideoTranscodeConfigured({ VERCEL: '1' })).toBe(true)
    expect(isVideoTranscodeConfigured({ VERCEL_OIDC_TOKEN: 'x' })).toBe(true)
    expect(isVideoTranscodeConfigured({ VERCEL_TOKEN: 't', VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'prj' })).toBe(true)
    expect(isVideoTranscodeConfigured({ VERCEL_TOKEN: 't' })).toBe(false)
    expect(isVideoTranscodeConfigured({})).toBe(false)
  })

  it('圧縮版を原本と同じ動画専用バケットの配下に置く', () => {
    const path = derivedVideoStoragePath('w/c/u/videos/a.mov', 'file-1')
    expect(path).toBe('w/c/u/videos/derived/file-1.mp4')
    expect(attachmentBucketForPath(path)).toBe('chat-videos')
  })

  it('圧縮版の保存名は拡張子だけ mp4 にする', () => {
    expect(derivedVideoFileName('練習.MOV')).toBe('練習.mp4')
    expect(derivedVideoFileName('clip')).toBe('clip.mp4')
  })

  it('圧縮版ができていればそれを、変換中・失敗・未変換なら原本を再生する', () => {
    const base = { fileName: 'a.mov', storagePath: 'w/c/u/videos/a.mov', derivedStoragePath: 'w/c/u/videos/derived/f.mp4' }
    expect(resolveVideoPlaybackSource({ ...base, metadata: { videoTranscodeStatus: 'ready' } })).toEqual({
      storagePath: 'w/c/u/videos/derived/f.mp4',
      downloadName: 'a.mp4',
      variant: 'derived',
    })
    for (const metadata of [{ videoTranscodeStatus: 'processing' }, { videoTranscodeStatus: 'failed' }, {}]) {
      expect(resolveVideoPlaybackSource({ ...base, metadata }).variant).toBe('original')
    }
    expect(
      resolveVideoPlaybackSource({ ...base, derivedStoragePath: null, metadata: { videoTranscodeStatus: 'ready' } }).variant,
    ).toBe('original')
  })

  it('不明な状態は未変換として扱う', () => {
    expect(readVideoTranscodeStatus({ videoTranscodeStatus: 'weird' })).toBeNull()
    expect(readVideoTranscodeStatus(null)).toBeNull()
  })

  it('変換スクリプトは署名 URL を引数に埋め込まず、720p 相当・H.264・faststart で出力する', () => {
    const script = buildTranscodeScript()
    expect(script).toContain('"$SOURCE_URL"')
    expect(script).toContain('"$UPLOAD_URL"')
    expect(script).not.toMatch(/https?:\/\//)
    expect(script).toContain("min(1280,iw)")
    expect(script).toContain('-c:v libx264')
    expect(script).toContain('+faststart')
    expect(script.startsWith('set -euo pipefail')).toBe(true)
  })
})
