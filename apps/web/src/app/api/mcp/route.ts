// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod4'
import { GET as listProjectsRoute } from '@/app/api/projects/route'
import { GET as getProjectRoute } from '@/app/api/projects/[id]/route'
import { GET as listTasksRoute, POST as createTaskRoute } from '@/app/api/tasks/route'
import { PATCH as updateTaskRoute } from '@/app/api/tasks/[id]/route'
import { POST as postMessageRoute } from '@/app/api/channels/[channelId]/messages/route'
import { GET as searchMessagesRoute } from '@/app/api/search/messages/route'
import {
  ApiTokenError,
  runWithApiTokenAccess,
  verifyApiToken,
  type VerifiedApiToken,
} from '@/lib/api-tokens'

export const runtime = 'nodejs'

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

async function routeResult(responsePromise: Promise<Response> | Response): Promise<ToolResult> {
  const response = await responsePromise
  const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    ...(response.ok ? {} : { isError: true }),
  }
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_projects',
      {
        title: 'List projects',
        description: 'List projects visible to the current Cairn user in the token workspace.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => routeResult(listProjectsRoute()),
    )

    server.registerTool(
      'get_project',
      {
        title: 'Get project',
        description: 'Get one Cairn project, including its project channel ID.',
        inputSchema: z.object({ projectId: z.uuid() }),
        annotations: { readOnlyHint: true },
      },
      async ({ projectId }) =>
        routeResult(
          getProjectRoute(new Request(`http://cairn.local/api/projects/${projectId}`), {
            params: Promise.resolve({ id: projectId }),
          }),
        ),
    )

    server.registerTool(
      'list_my_tasks',
      {
        title: 'List my tasks',
        description: 'List tasks assigned to the current Cairn user.',
        inputSchema: z.object({ projectId: z.uuid().optional() }),
        annotations: { readOnlyHint: true },
      },
      async ({ projectId }) => {
        const url = new URL('http://cairn.local/api/tasks')
        url.searchParams.set('assignee', 'me')
        if (projectId) url.searchParams.set('projectId', projectId)
        return routeResult(listTasksRoute(new Request(url)))
      },
    )

    server.registerTool(
      'create_task',
      {
        title: 'Create task',
        description: 'Create a Cairn task as the current user.',
        inputSchema: z.object({
          title: z.string().min(1).max(200),
          projectId: z.uuid().optional(),
          description: z.string().max(2000).optional(),
          priority: z.enum(['high', 'medium', 'low']).default('medium'),
          assigneeId: z.uuid().optional(),
          dueDate: z.iso.date().optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async (input) =>
        routeResult(
          createTaskRoute(
            new Request('http://cairn.local/api/tasks', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(input),
            }),
          ),
        ),
    )

    server.registerTool(
      'complete_task',
      {
        title: 'Complete task',
        description: 'Mark a Cairn task as done.',
        inputSchema: z.object({ taskId: z.uuid() }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ taskId }) =>
        routeResult(
          updateTaskRoute(
            new Request(`http://cairn.local/api/tasks/${taskId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ status: 'done' }),
            }),
            { params: Promise.resolve({ id: taskId }) },
          ),
        ),
    )

    server.registerTool(
      'post_message',
      {
        title: 'Post message',
        description:
          'Post a text message, optionally containing an external URL, as the current user.',
        inputSchema: z.object({
          channelId: z.uuid(),
          content: z.string().min(1).max(10000),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      async ({ channelId, content }) =>
        routeResult(
          postMessageRoute(
            new Request(`http://cairn.local/api/channels/${channelId}/messages`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ content, messageType: 'text' }),
            }),
            { params: Promise.resolve({ channelId }) },
          ),
        ),
    )

    server.registerTool(
      'search_messages',
      {
        title: 'Search messages',
        description: 'Search visible Cairn messages in the token workspace.',
        inputSchema: z.object({ query: z.string().trim().min(1).max(200) }),
        annotations: { readOnlyHint: true },
      },
      async ({ query }) => {
        const url = new URL('http://cairn.local/api/search/messages')
        url.searchParams.set('q', query)
        return routeResult(searchMessagesRoute(new Request(url)))
      },
    )
  },
  {
    serverInfo: { name: 'cairn', version: '0.1.0' },
    instructions:
      'These tools act on behalf of the human Cairn user who issued the API token. Read and write access is limited to that token’s fixed workspace.',
  },
)

const verifiedRequests = new WeakMap<Request, VerifiedApiToken>()
const authenticatedMcpHandler = withMcpAuth(
  mcpHandler,
  async (req, bearerToken) => {
    const verified = verifiedRequests.get(req)
    if (!verified || !bearerToken) return undefined
    return {
      token: bearerToken,
      clientId: `cairn-pat:${verified.id}`,
      scopes: verified.scope === 'write' ? ['read', 'write'] : ['read'],
      expiresAt: Math.floor(verified.expiresAt.getTime() / 1000),
      extra: {
        userId: verified.userId,
        workspaceId: verified.workspaceId,
        tokenId: verified.id,
      },
    }
  },
  { required: true },
)

async function handler(req: Request): Promise<Response> {
  const authorization = req.headers.get('authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!bearerToken) {
    return Response.json({ error: 'Bearer API token required' }, { status: 401 })
  }

  try {
    const verified = await verifyApiToken(bearerToken, {
      requiredScope: 'read',
      consumeRateLimit: true,
    })
    verifiedRequests.set(req, verified)
    return runWithApiTokenAccess(() => authenticatedMcpHandler(req))
  } catch (error) {
    if (error instanceof ApiTokenError) {
      return Response.json(
        { error: error.message },
        {
          status: error.status,
          ...(error.status === 429 ? { headers: { 'Retry-After': '60' } } : {}),
        },
      )
    }
    console.error('[MCP auth]', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export { handler as GET, handler as POST }
