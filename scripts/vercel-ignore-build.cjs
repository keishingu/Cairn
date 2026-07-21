// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { execFileSync } = require('node:child_process')

const EXCLUDED_DIRECTORY_PREFIXES = [
  '.claude/',
  '.github/',
  'apps/desktop/',
  'apps/mobile/',
  'docs/',
  'supabase/',
]

const EXCLUDED_EXACT_PATHS = new Set([
  '.env.example',
  '.gitignore',
  '.prettierrc',
  '.watchmanconfig',
  'LICENSE',
  'eas.json',
  'scripts/setup-mobile-lan.mjs',
])

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '')
}

function isKnownExcludedPath(filePath) {
  const normalized = normalizePath(filePath)
  const lower = normalized.toLowerCase()

  if (lower.endsWith('.md')) return true
  if (/\.test\.[cm]?[jt]sx?$/i.test(normalized)) return true
  if (EXCLUDED_EXACT_PATHS.has(normalized)) return true

  return EXCLUDED_DIRECTORY_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function shouldSkipBuild(changedPaths) {
  return changedPaths.length > 0 && changedPaths.every(isKnownExcludedPath)
}

function changedFilePaths(files) {
  return files.flatMap((file) =>
    file.previous_filename ? [file.previous_filename, file.filename] : [file.filename],
  )
}

function commitExists(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function resolveDiffBase(env = process.env, exists = commitExists) {
  const previousSha = env.VERCEL_GIT_PREVIOUS_SHA?.trim()
  if (!previousSha || !/^[0-9a-f]{7,64}$/i.test(previousSha)) return null
  return exists(previousSha) ? previousSha : null
}

function readChangedPaths(baseSha) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', baseSha, 'HEAD', '--'],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  )
  return output.split('\0').filter(Boolean)
}

function main() {
  const baseSha = resolveDiffBase()
  if (!baseSha) {
    console.log('Vercel build required: previous deployment SHA is unavailable (fail-open).')
    return 1
  }

  let changedPaths
  try {
    changedPaths = readChangedPaths(baseSha)
  } catch (error) {
    console.log(
      `Vercel build required: unable to inspect changed paths (fail-open): ${error.message}`,
    )
    return 1
  }

  if (shouldSkipBuild(changedPaths)) {
    console.log(
      `Vercel build skipped: all ${changedPaths.length} changed files are known exclusions.`,
    )
    return 0
  }

  const buildPath = changedPaths.find((filePath) => !isKnownExcludedPath(filePath))
  const reason = buildPath
    ? `build-impacting or unknown path detected: ${buildPath}`
    : 'no changed files detected'
  console.log(`Vercel build required: ${reason}.`)
  return 1
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = {
  changedFilePaths,
  isKnownExcludedPath,
  normalizePath,
  resolveDiffBase,
  shouldSkipBuild,
}
