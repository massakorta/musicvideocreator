-- Allow service_role to call job-claim RPCs via PostgREST
grant execute on function video_claim_render_job(text) to service_role;
grant execute on function video_claim_pipeline_job(text) to service_role;
