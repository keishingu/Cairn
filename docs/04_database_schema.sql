-- =====================================================
-- Project Collaboration OS / Cairn
-- PostgreSQL / Supabase Schema
-- =====================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ENUMS

create type workspace_role as enum (
  'owner',
  'admin',
  'member',
  'guest'
);

create type project_member_role as enum (
  'leader',
  'subleader',
  'member',
  'reviewer',
  'observer'
);

create type attendance_status as enum (
  'attending',
  'tentative',
  'declined'
);

create type message_type as enum (
  'text',
  'html',
  'system'
);

create type file_type as enum (
  'document',
  'image',
  'video',
  'audio',
  'other'
);

create type task_status as enum (
  'todo',
  'in_progress',
  'done'
);

create type ai_scope as enum (
  'workspace',
  'project'
);

-- USERS

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WORKSPACES

create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  logo_url text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- PROJECT STATUS

create table project_statuses (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#3B82F6',
  sort_order integer not null,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  unique(workspace_id, name)
);

-- PROJECTS

create table projects (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  description text,
  status_id uuid references project_statuses(id),
  start_date date,
  end_date date,
  archived boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_workspace on projects(workspace_id);
create index idx_projects_status on projects(status_id);
create index idx_projects_date on projects(start_date, end_date);

-- PROJECT MEMBERS

create table project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role project_member_role not null default 'member',
  attendance attendance_status not null default 'attending',
  notes text,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

-- MEMBER EXPERIENCE

create table member_experiences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null,
  title text not null,
  level text,
  notes text,
  created_at timestamptz not null default now()
);

-- CHANNELS

create table channels (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default 'general',
  created_at timestamptz not null default now()
);

-- MESSAGES

create table messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references channels(id) on delete cascade,
  parent_message_id uuid references messages(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  message_type message_type not null default 'text',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_messages_channel on messages(channel_id, created_at);

-- MESSAGE REACTIONS

create table message_reactions (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

-- FILES

create table files (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  file_type file_type not null default 'document',
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_files_project on files(project_id);

-- TASKS

create table tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'todo',
  assignee_id uuid references profiles(id),
  due_date date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- GALLERY

create table gallery_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  file_id uuid not null references files(id) on delete cascade,
  caption text,
  taken_at timestamptz,
  latitude numeric(10,7),
  longitude numeric(10,7),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_gallery_project on gallery_items(project_id);
create index idx_gallery_taken_at on gallery_items(taken_at);

create table gallery_comments (
  id uuid primary key default uuid_generate_v4(),
  gallery_item_id uuid not null references gallery_items(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table gallery_likes (
  id uuid primary key default uuid_generate_v4(),
  gallery_item_id uuid not null references gallery_items(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(gallery_item_id, user_id)
);

-- AI

create table ai_agents (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  scope ai_scope not null,
  name text not null,
  description text,
  model text not null,
  system_prompt text,
  agents_md text,
  html_template text,
  is_active boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_conversations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  agent_id uuid not null references ai_agents(id) on delete cascade,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- EMBEDDINGS

create table embeddings (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  file_id uuid references files(id) on delete cascade,
  chunk_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index idx_embeddings_vector
on embeddings
using ivfflat (embedding vector_cosine_ops);

-- TAGS

create table tags (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text,
  unique(workspace_id, name)
);

create table project_tags (
  project_id uuid not null references projects(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (project_id, tag_id)
);

-- EXTERNAL INTEGRATIONS

create table connected_accounts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table external_integrations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  integration_type text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table external_events (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  sync_status text not null default 'synced',
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- AUDIT LOGS

create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
