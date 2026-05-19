// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createOpenAI } from '@ai-sdk/openai'

export const openai = createOpenAI({
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
})

export const DEFAULT_MODEL = 'gpt-4o'
export const FAST_MODEL = 'gpt-4o-mini'
export const EMBEDDING_MODEL = 'text-embedding-3-small'
