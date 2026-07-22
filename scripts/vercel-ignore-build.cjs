// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use strict'

const PERMANENT_BRANCHES = new Set(['develop', 'main'])

function shouldBuild(env = process.env) {
  if (env.CAIRN_VERCEL_PREVIEW_REQUESTED === '1') {
    return { build: true, reason: 'preview explicitly requested' }
  }

  if (env.VERCEL_ENV === 'production') {
    return { build: true, reason: 'production deployment' }
  }

  const pullRequestId = env.VERCEL_GIT_PULL_REQUEST_ID?.trim()
  if (pullRequestId) {
    return { build: false, reason: `PR #${pullRequestId} is deployed by the Preview workflow` }
  }

  const commitRef = env.VERCEL_GIT_COMMIT_REF?.trim()
  if (PERMANENT_BRANCHES.has(commitRef)) {
    return { build: true, reason: `${commitRef} branch deployment` }
  }

  if (env.VERCEL_GIT_PROVIDER === 'github' && commitRef) {
    return { build: false, reason: `branch ${commitRef} has no pull request yet` }
  }

  return { build: true, reason: 'deployment context is unknown (fail-open)' }
}

function main() {
  const decision = shouldBuild()
  console.log(`Vercel build ${decision.build ? 'required' : 'skipped'}: ${decision.reason}.`)
  return decision.build ? 1 : 0
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { shouldBuild }
