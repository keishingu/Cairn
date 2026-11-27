// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod4'
import { GET as listProjectsRoute } from '@/app/api/projects/route'
import { GET as getProjectRoute } from '@/app/api/projects/[id]/route'
import { GET as listFilesRoute } from '@/app/api/files/route'
import { GET as listProjectFilesRoute } from '@/app/api/projects/[id]/files/route'
import { GET as readFileRoute } from '@/app/api/files/[id]/content/route'
import { GET as listTasksRoute, POST as createTaskRoute } from '@/app/api/tasks/route'
import { PATCH as updateTaskRoute } from '@/app/api/tasks/[id]/route'
import {
  GET as listMilestonesRoute,
  POST as createMilestoneRoute,
} from '@/app/api/projects/[id]/milestones/route'
import { PATCH as updateMilestoneRoute } from '@/app/api/projects/[id]/milestones/[milestoneId]/route'
import { POST as postMessageRoute } from '@/app/api/channels/[channelId]/messages/route'
import { GET as searchMessagesRoute } from '@/app/api/search/messages/route'
import { GET as listChannelsRoute } from '@/app/api/research/channels/route'
import { GET as readChannelMessagesRoute } from '@/app/api/research/channels/messages/route'
import { GET as getProjectMembersRoute } from '@/app/api/research/projects/[id]/members/route'
import { GET as listMembersRoute } from '@/app/api/research/members/route'
import { GET as getMemberHistoryRoute } from '@/app/api/research/members/history/route'
import {
  ApiTokenError,
  runWithApiTokenAccess,
  verifyApiToken,
  type VerifiedApiToken,
} from '@/lib/api-tokens'
import {
  getMcpResource,
  getProtectedResourceMetadataUrl,
  McpOAuthError,
  OAUTH_ACCESS_TOKEN_PREFIX,
  verifyMcpOAuthAccessToken,
  type VerifiedMcpOAuthToken,
} from '@/lib/mcp-oauth'
import { runWithVerifiedMcpRequest } from '@/lib/mcp-request-context'

export const runtime = 'nodejs'

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

// マイルストーン API（@cairn/shared の timeStringSchema）と同じ HH:MM 形式
const milestoneTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

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
      'list_files',
      {
        title: 'List files',
        description:
          'List files visible to the current Cairn user, newest first, optionally limited to one project. Without projectId the result is paged: pass nextCursor as cursor to read more.',
        inputSchema: z.object({
          projectId: z.uuid().optional(),
          cursor: z.string().max(500).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ projectId, cursor }) => {
        if (projectId) {
          return routeResult(
            listProjectFilesRoute(
              new Request(`http://cairn.local/api/projects/${projectId}/files`),
              { params: Promise.resolve({ id: projectId }) },
            ),
          )
        }
        const url = new URL('http://cairn.local/api/files')
        if (cursor) url.searchParams.set('cursor', cursor)
        return routeResult(listFilesRoute(new Request(url)))
      },
    )

    server.registerTool(
      'read_file',
      {
        title: 'Read file',
        description:
          'Read indexed text extracted from a visible Cairn file. Continue with nextStartChunk when present.',
        inputSchema: z.object({
          fileId: z.uuid(),
          startChunk: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(10).default(5),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ fileId, startChunk, limit }) => {
        const url = new URL(`http://cairn.local/api/files/${fileId}/content`)
        url.searchParams.set('startChunk', String(startChunk))
        url.searchParams.set('limit', String(limit))
        return routeResult(
          readFileRoute(new Request(url), { params: Promise.resolve({ id: fileId }) }),
        )
      },
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
          channelId: z.uuid().optional(),
          description: z.string().max(2000).optional(),
          priority: z.enum(['high', 'medium', 'low']).default('medium'),
          assigneeId: z.uuid().optional(),
          dueDate: z.iso.date().optional(),
        }).refine(
          input => !(input.projectId && input.channelId),
          { message: 'projectId and channelId cannot both be specified' },
        ),
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
      'list_milestones',
      {
        title: 'List milestones',
        description:
          'List milestones of a visible project, ordered by start date. Each milestone has its own discussion channel (channelId).',
        inputSchema: z.object({ projectId: z.uuid() }),
        annotations: { readOnlyHint: true },
      },
      async ({ projectId }) =>
        routeResult(
          listMilestonesRoute(
            new Request(`http://cairn.local/api/projects/${projectId}/milestones`),
            { params: Promise.resolve({ id: projectId }) },
          ),
        ),
    )

    server.registerTool(
      'create_milestone',
      {
        title: 'Create milestone',
        description:
          'Create a milestone in a project as the current user. Dates are YYYY-MM-DD and times are HH:MM. The change is announced in the project channel.',
        inputSchema: z.object({
          projectId: z.uuid(),
          title: z.string().trim().min(1).max(100),
          description: z.string().max(1000).optional(),
          startDate: z.iso.date().optional(),
          endDate: z.iso.date().optional(),
          startTime: milestoneTimeSchema.optional(),
          endTime: milestoneTimeSchema.optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ projectId, ...body }) =>
        routeResult(
          createMilestoneRoute(
            new Request(`http://cairn.local/api/projects/${projectId}/milestones`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
            { params: Promise.resolve({ id: projectId }) },
          ),
        ),
    )

    server.registerTool(
      'update_milestone',
      {
        title: 'Update milestone',
        description:
          'Update a milestone: title, description, period, or completion. Pass null to clear description, dates or times. Omitted fields stay unchanged. Period and completion changes are announced in the project channel.',
        inputSchema: z
          .object({
            projectId: z.uuid(),
            milestoneId: z.uuid(),
            title: z.string().trim().min(1).max(100).optional(),
            description: z.string().max(1000).nullable().optional(),
            startDate: z.iso.date().nullable().optional(),
            endDate: z.iso.date().nullable().optional(),
            startTime: milestoneTimeSchema.nullable().optional(),
            endTime: milestoneTimeSchema.nullable().optional(),
            completed: z.boolean().optional(),
          })
          .refine(
            ({ projectId: _projectId, milestoneId: _milestoneId, ...fields }) =>
              Object.values(fields).some((value) => value !== undefined),
            { message: 'At least one field to update is required' },
          ),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ projectId, milestoneId, ...body }) =>
        routeResult(
          updateMilestoneRoute(
            new Request(`http://cairn.local/api/projects/${projectId}/milestones/${milestoneId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
            { params: Promise.resolve({ id: projectId, milestoneId }) },
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
    server.registerTool(
      'list_channels',
      {
        title: 'List channels',
        description:
          'List non-DM channels (workspace, project and thread channels) visible to the current Cairn user. Use this to browse or search channels. To just read a channel whose name is known, call read_channel_messages with channelName instead.',
        inputSchema: z.object({
          query: z.string().trim().max(100).optional(),
          projectId: z.uuid().optional(),
          includeArchived: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ query, projectId, includeArchived, limit }) => {
        const url = new URL('http://cairn.local/api/research/channels')
        if (query) url.searchParams.set('query', query)
        if (projectId) url.searchParams.set('projectId', projectId)
        if (includeArchived !== undefined) url.searchParams.set('includeArchived', String(includeArchived))
        if (limit) url.searchParams.set('limit', String(limit))
        return routeResult(listChannelsRoute(new Request(url)))
      },
    )

    server.registerTool(
      'read_channel_messages',
      {
        title: 'Read channel messages',
        description:
          'Read messages in one visible channel, oldest first, within a time range. Pass exactly one of channelId or channelName. When the name is known (e.g. "#review"), pass channelName directly and skip list_channels; if several channels share the name the error lists candidate IDs. Continue with nextCursor when truncated is true.',
        inputSchema: z
          .object({
            channelId: z.uuid().optional(),
            channelName: z.string().trim().min(1).max(100).optional(),
            since: z.iso.datetime({ offset: true }).optional(),
            until: z.iso.datetime({ offset: true }).optional(),
            cursor: z.string().max(100).optional(),
            limit: z.number().int().min(1).max(100).optional(),
          })
          .refine(input => !!input.channelId !== !!input.channelName, {
            message: 'Specify exactly one of channelId or channelName',
          }),
        annotations: { readOnlyHint: true },
      },
      async ({ channelId, channelName, since, until, cursor, limit }) => {
        const url = new URL('http://cairn.local/api/research/channels/messages')
        if (channelId) url.searchParams.set('channelId', channelId)
        if (channelName) url.searchParams.set('channelName', channelName)
        if (since) url.searchParams.set('since', since)
        if (until) url.searchParams.set('until', until)
        if (cursor) url.searchParams.set('cursor', cursor)
        if (limit) url.searchParams.set('limit', String(limit))
        return routeResult(readChannelMessagesRoute(new Request(url)))
      },
    )

    server.registerTool(
      'get_project_members',
      {
        title: 'Get project members',
        description:
          'List the members of a visible project with their project role (leader, reviewer, ...), attendance and profile attributes.',
        inputSchema: z.object({ projectId: z.uuid() }),
        annotations: { readOnlyHint: true },
      },
      async ({ projectId }) =>
        routeResult(
          getProjectMembersRoute(
            new Request(`http://cairn.local/api/research/projects/${projectId}/members`),
            { params: Promise.resolve({ id: projectId }) },
          ),
        ),
    )

    server.registerTool(
      'list_members',
      {
        title: 'List members',
        description:
          'List workspace members visible to the current Cairn user, including their profile attributes. Optionally filter by display name or by attribute names (members having any of them).',
        inputSchema: z.object({
          query: z.string().trim().max(100).optional(),
          attributeNames: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
          includeInactive: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ query, attributeNames, includeInactive, limit }) => {
        const url = new URL('http://cairn.local/api/research/members')
        if (query) url.searchParams.set('query', query)
        for (const name of attributeNames ?? []) url.searchParams.append('attribute', name)
        if (includeInactive !== undefined) url.searchParams.set('includeInactive', String(includeInactive))
        if (limit) url.searchParams.set('limit', String(limit))
        return routeResult(listMembersRoute(new Request(url)))
      },
    )

    server.registerTool(
      'get_member_history',
      {
        title: 'Get member history',
        description:
          'Get the project history of up to 50 members at once: projects they joined, project roles, periods, statuses and files attached to each project. Select members by userIds, or directly by attributeNames (profile attributes, exact match, any) and/or projectRoleNames (project role names such as "leader", exact match, any, only projects visible to you) without calling list_members first. Combining filters requires all of them; adding userIds narrows to those members. Filters exclude inactive members. At least one of userIds, attributeNames, projectRoleNames is required. Files are listed once per project in projectFiles (newest first, 10-50 per project depending on how many projects are returned; filesTruncated means older files remain). Read file bodies with read_file.',
        inputSchema: z
          .object({
            userIds: z.array(z.uuid()).min(1).max(50).optional(),
            attributeNames: z.array(z.string().trim().min(1).max(20)).min(1).max(10).optional(),
            projectRoleNames: z.array(z.string().trim().min(1).max(50)).min(1).max(10).optional(),
            includeFiles: z.boolean().optional(),
          })
          .refine(input => input.userIds || input.attributeNames || input.projectRoleNames, {
            message: 'Specify at least one of userIds, attributeNames, projectRoleNames',
          }),
        annotations: { readOnlyHint: true },
      },
      async ({ userIds, attributeNames, projectRoleNames, includeFiles }) => {
        const url = new URL('http://cairn.local/api/research/members/history')
        for (const userId of userIds ?? []) url.searchParams.append('userId', userId)
        for (const name of attributeNames ?? []) url.searchParams.append('attribute', name)
        for (const name of projectRoleNames ?? []) url.searchParams.append('projectRole', name)
        if (includeFiles !== undefined) url.searchParams.set('includeFiles', String(includeFiles))
        return routeResult(getMemberHistoryRoute(new Request(url)))
      },
    )
  },
  {
    serverInfo: { name: 'cairn', version: '0.4.0' },
    instructions:
      'These tools act on behalf of the human Cairn user who authorized the credential. Read and write access is limited to its fixed workspace.',
  },
)

type VerifiedMcpCredential = (VerifiedApiToken & { kind: 'pat' }) | VerifiedMcpOAuthToken

const verifiedRequests = new WeakMap<Request, VerifiedMcpCredential>()
const authenticatedMcpHandler = withMcpAuth(
  mcpHandler,
  async (req, bearerToken) => {
    const verified = verifiedRequests.get(req)
    if (!verified || !bearerToken) return undefined
    return {
      token: bearerToken,
      clientId: verified.kind === 'oauth' ? verified.clientId : `cairn-pat:${verified.id}`,
      scopes: verified.scope === 'write' ? ['read', 'write'] : ['read'],
      expiresAt: Math.floor(verified.expiresAt.getTime() / 1000),
      extra: {
        userId: verified.userId,
        workspaceId: verified.workspaceId,
        tokenId: verified.id,
        credentialType: verified.kind === 'oauth' ? 'oauth' : 'pat',
      },
    }
  },
  { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource' },
)

function unauthorized(req: Request, message: string, error?: string): Response {
  const parameters = [
    'realm="cairn-mcp"',
    `resource_metadata="${getProtectedResourceMetadataUrl(req)}"`,
    ...(error ? [`error="${error}"`] : []),
  ]
  return Response.json(
    { error: message },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer ${parameters.join(', ')}` } },
  )
}

async function handler(req: Request): Promise<Response> {
  const authorization = req.headers.get('authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!bearerToken) {
    return unauthorized(req, 'Bearer token required')
  }

  try {
    const verified: VerifiedMcpCredential = bearerToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)
      ? await verifyMcpOAuthAccessToken(bearerToken, {
          requiredScope: 'read',
          resource: getMcpResource(req),
          consumeRateLimit: true,
        })
      : {
          kind: 'pat',
          ...(await verifyApiToken(bearerToken, {
            requiredScope: 'read',
            consumeRateLimit: true,
          })),
        }
    verifiedRequests.set(req, verified)
    return runWithApiTokenAccess(() =>
      runWithVerifiedMcpRequest(
        {
          rawToken: bearerToken,
          tokenId: verified.id,
          clientId: verified.kind === 'oauth' ? verified.clientId : `cairn-pat:${verified.id}`,
          userId: verified.userId,
          workspaceId: verified.workspaceId,
          role: verified.role,
          scope: verified.scope,
          expiresAt: verified.expiresAt,
        },
        () => authenticatedMcpHandler(req),
      ),
    )
  } catch (error) {
    if (error instanceof ApiTokenError) {
      if (error.status === 401) return unauthorized(req, error.message, 'invalid_token')
      return Response.json(
        { error: error.message },
        {
          status: error.status,
          ...(error.status === 429 ? { headers: { 'Retry-After': '60' } } : {}),
        },
      )
    }
    if (error instanceof McpOAuthError) {
      if (error.status === 401) return unauthorized(req, error.message, error.code)
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
