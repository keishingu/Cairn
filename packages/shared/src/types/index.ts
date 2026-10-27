// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'

export type ProjectMemberRole = 'leader' | 'subleader' | 'member' | 'reviewer' | 'observer'

export type AttendanceStatus = 'attending' | 'tentative' | 'declined'

// blocks はアプリの Bot だけが投稿する。人の投稿 API（schemas の messageType）では受け付けない
export type MessageType = 'text' | 'html' | 'system' | 'blocks'

export type FileType = 'document' | 'image' | 'video' | 'audio' | 'other'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type TaskPriority = 'high' | 'medium' | 'low'

export type AiScope = 'workspace' | 'project'
