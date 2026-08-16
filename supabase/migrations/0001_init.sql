-- AI Music Video Creator schema
create extension if not exists "pgcrypto";

create table if not exists video_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  song_title text not null default '',
  status text not null,
  style_id text,
  audio_asset_id uuid,
  duration_seconds numeric not null default 0,
  lyrics text not null default '',
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists video_visual_bibles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references video_projects(id) on delete cascade,
  document jsonb not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists video_characters (
  id text not null,
  project_id uuid not null references video_projects(id) on delete cascade,
  name text not null,
  document jsonb not null,
  locked_reference_image boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table if not exists video_environments (
  id text not null,
  project_id uuid not null references video_projects(id) on delete cascade,
  name text not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table if not exists video_storyboard_scenes (
  id uuid primary key,
  project_id uuid not null references video_projects(id) on delete cascade,
  scene_order integer not null,
  start_time numeric not null,
  end_time numeric not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists video_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references video_projects(id) on delete cascade,
  type text not null,
  source text not null,
  storage_path text not null,
  public_url text not null,
  mime_type text not null,
  width integer,
  height integer,
  duration_seconds numeric,
  file_size_bytes bigint,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references video_projects(id) on delete cascade,
  status text not null,
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  output_url text,
  output_asset_id uuid,
  error text,
  claimed_by text,
  file_size_bytes bigint
);

create table if not exists video_ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  project_id uuid,
  provider text not null,
  model text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  error text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer
);

create index if not exists video_render_jobs_status_idx on video_render_jobs (status, created_at);
create index if not exists video_assets_project_idx on video_assets (project_id, type);
create index if not exists video_storyboard_scenes_project_idx on video_storyboard_scenes (project_id, scene_order);

create or replace function video_claim_render_job(worker_id text)
returns video_render_jobs
language plpgsql
as $$
declare
  job video_render_jobs;
begin
  select * into job
  from video_render_jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update video_render_jobs
  set status = 'preparing',
      claimed_by = worker_id,
      started_at = now()
  where id = job.id
  returning * into job;

  return job;
end;
$$;
