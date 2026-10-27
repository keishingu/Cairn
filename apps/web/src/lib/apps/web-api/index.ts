// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotContext } from '../bot-tokens'
import { chatDelete, chatPostMessage, chatUpdate } from './chat'
import { authTest, conversationsMembers, usersInfo } from './members'
import { fail, type WebApiArgs, type WebApiMethod, type WebApiResult } from './types'
import { viewsOpen, viewsUpdate } from './views'

export type { WebApiArgs, WebApiResult } from './types'

// メソッド名・引数・エラーコードは Slack の Web API に合わせる。Bolt の slackApiUrl を差し替えるだけで向き先が変わるようにするため。
const METHODS: Record<string, WebApiMethod> = {
  'auth.test': { scope: null, handle: (bot) => authTest(bot) },
  'chat.postMessage': { scope: 'chat:write', handle: chatPostMessage },
  'chat.update': { scope: 'chat:write', handle: chatUpdate },
  'chat.delete': { scope: 'chat:write', handle: chatDelete },
  'users.info': { scope: 'users:read', handle: usersInfo },
  'conversations.members': { scope: 'channels:read', handle: conversationsMembers },
  // Slack と同じく views.* はスコープを要さない。開けるのは押した本人に発行した trigger_id がある間だけ
  'views.open': { scope: null, handle: viewsOpen },
  'views.update': { scope: null, handle: viewsUpdate },
}

export function isKnownWebApiMethod(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(METHODS, method)
}

export async function dispatchWebApi(method: string, bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const entry = isKnownWebApiMethod(method) ? METHODS[method] : undefined
  if (!entry) return fail('unknown_method')
  if (entry.scope && !bot.scopes.includes(entry.scope)) {
    return fail('missing_scope', { needed: entry.scope, provided: bot.scopes.join(',') })
  }
  return entry.handle(bot, args)
}
