// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export function buildAiChatRequestBody<T>(messages: T[]) {
  const lastMessage = messages.at(-1)

  return {
    messages: lastMessage ? [lastMessage] : [],
  }
}
