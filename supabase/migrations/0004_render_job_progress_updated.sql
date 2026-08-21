alter table video_render_jobs
  add column if not exists progress_updated_at timestamptz;

update video_render_jobs
set progress_updated_at = coalesce(started_at, created_at)
where progress_updated_at is null
  and status in ('preparing', 'rendering', 'uploading', 'complete', 'failed');
