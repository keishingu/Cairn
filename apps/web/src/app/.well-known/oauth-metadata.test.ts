// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { GET as getAuthorizationServerMetadata } from './oauth-authorization-server/route'
import { GET as getPathAwareProtectedResourceMetadata } from './oauth-protected-resource/api/mcp/route'
import { GET as getProtectedResourceMetadata } from './oauth-protected-resource/route'

describe('MCP OAuth discovery metadata', () => {
  it('Authorization Server MetadataでPKCE・DCR・code/refreshを公開する', async () => {
    const response = getAuthorizationServerMetadata(
      new Request('https://develop.oss-cairn.com/.well-known/oauth-authorization-server'),
    )
    const metadata = await response.json()

    expect(metadata).toMatchObject({
      issuer: 'https://develop.oss-cairn.com',
      authorization_endpoint: 'https://develop.oss-cairn.com/oauth/authorize',
      token_endpoint: 'https://develop.oss-cairn.com/api/oauth/token',
      registration_endpoint: 'https://develop.oss-cairn.com/api/oauth/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    })
  })

  it('Protected Resource MetadataでMCP URL・issuer・scopeを固定する', async () => {
    const response = getProtectedResourceMetadata(
      new Request('https://develop.oss-cairn.com/.well-known/oauth-protected-resource'),
    )
    const metadata = await response.json()

    expect(metadata).toMatchObject({
      resource: 'https://develop.oss-cairn.com/api/mcp',
      authorization_servers: ['https://develop.oss-cairn.com'],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
    })
  })

  it('RFC 9728のpath-aware URLでも同じProtected Resource Metadataを返す', async () => {
    const response = getPathAwareProtectedResourceMetadata(
      new Request('https://develop.oss-cairn.com/.well-known/oauth-protected-resource/api/mcp'),
    )

    expect(await response.json()).toMatchObject({
      resource: 'https://develop.oss-cairn.com/api/mcp',
      authorization_servers: ['https://develop.oss-cairn.com'],
    })
  })
})
