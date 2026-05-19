// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['./base.js', 'next/core-web-vitals', 'next/typescript'],
  rules: {
    '@next/next/no-html-link-for-pages': 'error',
  },
}
