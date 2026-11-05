// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { buildTranscodeScript, VIDEO_TRANSCODE_REGION } from './transcode'

// Vercel Sandbox で ffmpeg を動かす薄い層。Inngest のジョブは数分〜数十分かかる変換を
// 1つの関数呼び出しで待てないため、コマンドを detached で起動し、別の step で終了を確かめる。

/** 変換1本の上限。Pro は1セッション最大 24 時間だが、500MiB の動画には十分な長さに抑える */
export const VIDEO_TRANSCODE_TIMEOUT_MS = 60 * 60 * 1000
const VIDEO_TRANSCODE_VCPUS = 4

export interface StartedTranscode {
  sandboxName: string
  cmdId: string
}

export type TranscodeProgress =
  | { done: false }
  | { done: true; exitCode: number; stderrTail: string }

function credentials() {
  // Vercel 上では OIDC が自動で使われる。外では3つ揃ったアクセストークンを渡す
  const token = process.env['VERCEL_TOKEN']
  const teamId = process.env['VERCEL_TEAM_ID']
  const projectId = process.env['VERCEL_PROJECT_ID']
  return token && teamId && projectId ? { token, teamId, projectId } : {}
}

export async function startVideoTranscode(input: {
  sandboxName: string
  sourceUrl: string
  uploadUrl: string
}): Promise<StartedTranscode> {
  const { Sandbox } = await import('@vercel/sandbox')
  const sandbox = await Sandbox.create({
    name: input.sandboxName,
    region: VIDEO_TRANSCODE_REGION,
    resources: { vcpus: VIDEO_TRANSCODE_VCPUS },
    timeout: VIDEO_TRANSCODE_TIMEOUT_MS,
    // 1回ごとの使い捨て。停止時のスナップショットを残さない
    persistent: false,
    ...credentials(),
  })
  const command = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-c', buildTranscodeScript()],
    env: { SOURCE_URL: input.sourceUrl, UPLOAD_URL: input.uploadUrl },
    sudo: true,
    detached: true,
  })
  return { sandboxName: input.sandboxName, cmdId: command.cmdId }
}

export async function checkVideoTranscode(started: StartedTranscode): Promise<TranscodeProgress> {
  const { Sandbox } = await import('@vercel/sandbox')
  const sandbox = await Sandbox.get({ name: started.sandboxName, ...credentials() })
  const command = await sandbox.getCommand(started.cmdId)
  if (command.exitCode === null) return { done: false }
  const stderr = command.exitCode === 0 ? '' : await command.stderr().catch(() => '')
  return { done: true, exitCode: command.exitCode, stderrTail: stderr.slice(-2000) }
}

export async function stopVideoTranscode(sandboxName: string): Promise<void> {
  const { Sandbox } = await import('@vercel/sandbox')
  const sandbox = await Sandbox.get({ name: sandboxName, ...credentials() })
  await sandbox.stop()
}
