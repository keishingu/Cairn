alter table public.workspace_members
  add column if not exists status_auto boolean not null default false;
