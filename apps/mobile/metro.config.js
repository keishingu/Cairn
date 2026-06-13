// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// デフォルトはモノレポ検出で workspaceRoot 全体を watch するが、
// apps/web の .next（Turbopack のビルド成果物）への書き込みを拾って
// Fast Refresh が連発するため、モバイルが実際に参照する場所に限定する
config.watchFolders = [
  path.join(workspaceRoot, 'node_modules'),
  path.join(workspaceRoot, 'packages'),
]

// watch 範囲内でもビルドキャッシュ類は解決・監視の対象から外す
config.resolver.blockList = [/node_modules\/\.cache\/.*/, /\.next\/.*/, /\.turbo\/.*/]

module.exports = config
