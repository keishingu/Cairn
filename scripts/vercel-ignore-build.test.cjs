// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { shouldBuild } = require('./vercel-ignore-build.cjs')

test('Git連携によるPRの自動ビルドは初回を含めてスキップする', () => {
  assert.deepEqual(shouldBuild({ VERCEL_GIT_PULL_REQUEST_ID: '403' }), {
    build: false,
    reason: 'PR #403 is deployed by the Preview workflow',
  })
})

test('Preview workflowからの明示要求はビルドする', () => {
  assert.equal(
    shouldBuild({
      CAIRN_VERCEL_PREVIEW_REQUESTED: '1',
      VERCEL_GIT_PULL_REQUEST_ID: '403',
    }).build,
    true,
  )
})

test('mainとdevelopへのpushは常にビルドする', () => {
  assert.equal(shouldBuild({ VERCEL_GIT_COMMIT_REF: 'main' }).build, true)
  assert.equal(shouldBuild({ VERCEL_GIT_COMMIT_REF: 'develop' }).build, true)
})

test('PR作成前のfeature branch pushはスキップする', () => {
  assert.equal(
    shouldBuild({
      VERCEL_GIT_PROVIDER: 'github',
      VERCEL_GIT_COMMIT_REF: 'feat/example',
    }).build,
    false,
  )
})

test('productionと未知の実行コンテキストはfail-openでビルドする', () => {
  assert.equal(shouldBuild({ VERCEL_ENV: 'production' }).build, true)
  assert.equal(shouldBuild({}).build, true)
})
