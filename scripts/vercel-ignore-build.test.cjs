// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  changedFilePaths,
  isKnownExcludedPath,
  resolveDiffBase,
  shouldSkipBuild,
} = require('./vercel-ignore-build.cjs')

test('既知のWeb非依存パスだけならビルドをスキップする', () => {
  const paths = [
    'docs/production-deployment.md',
    'CLAUDE.md',
    'apps/mobile/app/index.tsx',
    'apps/desktop/src/main.js',
    '.github/workflows/ci.yml',
    '.claude/settings.json',
    'supabase/migrations/20260722000000_example.sql',
    'apps/web/src/example.test.tsx',
    'eas.json',
    'scripts/setup-mobile-lan.mjs',
  ]

  assert.equal(shouldSkipBuild(paths), true)
  for (const filePath of paths) assert.equal(isKnownExcludedPath(filePath), true)
})

test('Webまたは共有パッケージの変更が1件でもあればビルドする', () => {
  assert.equal(shouldSkipBuild(['docs/README.md', 'apps/web/src/app/page.tsx']), false)
  assert.equal(
    shouldSkipBuild(['apps/mobile/app/index.tsx', 'packages/shared/src/index.ts']),
    false,
  )
})

test('Webから除外対象へのrenameは旧パスを見てビルドする', () => {
  const paths = changedFilePaths([
    {
      filename: 'docs/old-web-page.md',
      previous_filename: 'apps/web/src/app/old-web-page.tsx',
    },
  ])

  assert.deepEqual(paths, ['apps/web/src/app/old-web-page.tsx', 'docs/old-web-page.md'])
  assert.equal(shouldSkipBuild(paths), false)
})

test('依存・workspace・Vercel設定の変更はビルドする', () => {
  const paths = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    'vercel.json',
    '.npmrc',
  ]

  for (const filePath of paths) assert.equal(isKnownExcludedPath(filePath), false)
})

test('未知のパスと変更ファイルなしはfail-openでビルドする', () => {
  assert.equal(shouldSkipBuild(['new-platform/config.json']), false)
  assert.equal(shouldSkipBuild([]), false)
})

test('比較元SHAが無効・未取得ならfail-openにする', () => {
  assert.equal(
    resolveDiffBase({}, () => true),
    null,
  )
  assert.equal(
    resolveDiffBase({ VERCEL_GIT_PREVIOUS_SHA: 'not-a-sha' }, () => true),
    null,
  )
  assert.equal(
    resolveDiffBase({ VERCEL_GIT_PREVIOUS_SHA: 'a'.repeat(40) }, () => false),
    null,
  )
  assert.equal(
    resolveDiffBase({ VERCEL_GIT_PREVIOUS_SHA: 'a'.repeat(40) }, () => true),
    'a'.repeat(40),
  )
})
