create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  updated_by uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  raw_instruction text not null,
  timezone text not null default 'Asia/Tokyo',
  schedule jsonb not null,
  mention_user_ids jsonb not null default '[]'::jsonb,
  mentions jsonb not null default '[]'::jsonb,
  action_spec jsonb not null,
  next_run_at timestamptz,
  last_compiled_at timestamptz not null default now(),
  last_compile_preview text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_jobs_workspace_enabled_next_run
  on public.scheduled_jobs (workspace_id, enabled, next_run_at);

create table if not exists public.scheduled_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.scheduled_jobs(id) on delete cascade,
  scheduled_for timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  status_code integer,
  error_message text,
  created_at timestamptz not null default now(),
  unique (job_id, scheduled_for)
);

create index if not exists idx_scheduled_job_runs_job_created
  on public.scheduled_job_runs (job_id, created_at);
