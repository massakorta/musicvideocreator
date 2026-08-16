-- Pipeline jobs + public share ids

create table if not exists video_pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references video_projects(id) on delete cascade,
  kind text not null,
  status text not null,
  stage text not null default 'bible',
  progress integer not null default 0,
  stage_detail text,
  expected_seconds integer not null default 300,
  characters_done integer not null default 0,
  characters_total integer not null default 0,
  images_done integer not null default 0,
  images_total integer not null default 0,
  render_job_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  claimed_by text
);

create index if not exists video_pipeline_jobs_status_idx on video_pipeline_jobs (status, created_at);
create index if not exists video_pipeline_jobs_project_idx on video_pipeline_jobs (project_id, created_at desc);

alter table video_projects add column if not exists share_id text unique;

create or replace function video_claim_pipeline_job(worker_id text)
returns video_pipeline_jobs
language plpgsql
as $$
declare
  job video_pipeline_jobs;
begin
  select * into job
  from video_pipeline_jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update video_pipeline_jobs
  set status = 'running',
      claimed_by = worker_id,
      started_at = now()
  where id = job.id
  returning * into job;

  return job;
end;
$$;
