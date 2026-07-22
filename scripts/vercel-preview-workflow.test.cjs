// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use strict'

const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const test = require('node:test')

const workflow = readFileSync('.github/workflows/vercel-preview.yml', 'utf8')
const vercelConfig = JSON.parse(readFileSync('apps/web/vercel.json', 'utf8'))

test('@vercel previewの完全一致かつ権限のあるコメントだけを受け付ける', () => {
  assert.match(workflow, /github\.event\.comment\.body == '@vercel preview'/)
  assert.match(workflow, /OWNER.*MEMBER.*COLLABORATOR/)
})

test('同一repositoryのPR作成時にもPreviewを起動する', () => {
  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /types: \[opened\]/)
  assert.match(workflow, /github\.event_name == 'pull_request'/)
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/)
})

test('openかつ同一repositoryのPRだけをデプロイする', () => {
  assert.match(workflow, /pullRequest\.state !== 'open'/)
  assert.match(workflow, /pullRequest\.head\.repo\.full_name/)
  assert.match(workflow, /disabled for pull requests from forks/)
})

test('固定版CLIで最新PR SHAのPreviewを明示要求する', () => {
  assert.match(workflow, /ref: \$\{\{ steps\.pr\.outputs\.sha \}\}/)
  assert.match(workflow, /vercel@54\.6\.1 deploy/)
  assert.match(workflow, /--build-env CAIRN_VERCEL_PREVIEW_REQUESTED=1/)
  assert.match(workflow, /--target=preview/)
  assert.match(workflow, /--meta githubCommitRef=\$\{\{ steps\.pr\.outputs\.ref \}\}/)
  assert.match(workflow, /--meta githubCommitSha=\$\{\{ steps\.pr\.outputs\.sha \}\}/)
})

test('Vercel認証情報をsecretから受け取りPreview URLを返信する', () => {
  assert.match(workflow, /secrets\.VERCEL_TOKEN/)
  assert.match(workflow, /secrets\.VERCEL_ORG_ID/)
  assert.match(workflow, /secrets\.VERCEL_PROJECT_ID/)
  assert.match(workflow, /Vercel Preview: \$\{process\.env\.PREVIEW_URL\}/)
  assert.match(workflow, /if: github\.event_name == 'issue_comment'/)
})

test('apps/webをRoot DirectoryとするVercelからignore scriptを実行できる', () => {
  const commandPath = vercelConfig.ignoreCommand.replace(/^node /, '')
  assert.equal(existsSync(resolve('apps/web', commandPath)), true)
})
