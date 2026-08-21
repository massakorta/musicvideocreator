import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AiUsageLog, AssetRecord, MusicVideoProject, PipelineJob, RenderJob } from '@music-video/shared';
import { config } from '../config.js';
import { deriveStatus, mergeProjectDocuments, nowIso } from '../services/projectUtils.js';
import type { Repositories } from './types.js';

interface ProjectRow {
  id: string;
  name: string;
  song_title: string;
  status: MusicVideoProject['status'];
  style_id: string | null;
  audio_asset_id: string | null;
  duration_seconds: number;
  lyrics: string;
  document: MusicVideoProject;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: string;
  project_id: string;
  type: AssetRecord['type'];
  source: AssetRecord['source'];
  storage_path: string;
  public_url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

interface RenderJobRow {
  id: string;
  project_id: string;
  status: RenderJob['status'];
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  output_url: string | null;
  output_asset_id: string | null;
  error: string | null;
  claimed_by: string | null;
  file_size_bytes: number | null;
  progress_updated_at: string | null;
}

function projectFromRow(row: ProjectRow & { share_id?: string | null }): MusicVideoProject {
  return {
    ...row.document,
    id: row.id,
    name: row.name,
    songTitle: row.song_title,
    status: row.status,
    styleId: row.style_id ?? undefined,
    durationSeconds: Number(row.duration_seconds),
    lyrics: row.lyrics,
    shareId: row.share_id ?? row.document.shareId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectToRow(project: MusicVideoProject) {
  return {
    id: project.id,
    name: project.name,
    song_title: project.songTitle,
    status: project.status,
    style_id: project.styleId ?? null,
    audio_asset_id: project.audio?.assetId ?? null,
    duration_seconds: project.durationSeconds,
    lyrics: project.lyrics,
    document: project,
    share_id: project.shareId ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function assetFromRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    source: row.source,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    metadata: row.metadata_json ?? undefined,
    createdAt: row.created_at,
  };
}

interface PipelineJobRow {
  id: string;
  project_id: string;
  kind: PipelineJob['kind'];
  status: PipelineJob['status'];
  stage: PipelineJob['stage'];
  progress: number;
  stage_detail: string | null;
  expected_seconds: number;
  characters_done: number;
  characters_total: number;
  images_done: number;
  images_total: number;
  render_job_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  claimed_by: string | null;
}

function renderJobFromRow(row: RenderJobRow): RenderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    progress: row.progress,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    outputUrl: row.output_url ?? undefined,
    outputAssetId: row.output_asset_id ?? undefined,
    error: row.error ?? undefined,
    claimedBy: row.claimed_by ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    progressUpdatedAt: row.progress_updated_at ?? undefined,
  };
}

function parseClaimedRow<T extends { id?: string | null }, R>(
  data: unknown,
  map: (row: T) => R,
): R | null {
  const row = (Array.isArray(data) ? data[0] : data) as T | null | undefined;
  if (!row || typeof row !== 'object' || !row.id) return null;
  return map(row);
}

function pipelineJobFromRow(row: PipelineJobRow): PipelineJob {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    stageDetail: row.stage_detail ?? undefined,
    expectedSeconds: row.expected_seconds,
    charactersDone: row.characters_done,
    charactersTotal: row.characters_total,
    imagesDone: row.images_done,
    imagesTotal: row.images_total,
    renderJobId: row.render_job_id ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
    claimedBy: row.claimed_by ?? undefined,
  };
}

function pipelineJobToRow(job: PipelineJob) {
  return {
    id: job.id,
    project_id: job.projectId,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    stage_detail: job.stageDetail ?? null,
    expected_seconds: job.expectedSeconds,
    characters_done: job.charactersDone,
    characters_total: job.charactersTotal,
    images_done: job.imagesDone,
    images_total: job.imagesTotal,
    render_job_id: job.renderJobId ?? null,
    created_at: job.createdAt,
    started_at: job.startedAt ?? null,
    completed_at: job.completedAt ?? null,
    error: job.error ?? null,
    claimed_by: job.claimedBy ?? null,
  };
}

function finalizeProject(project: MusicVideoProject): MusicVideoProject {
  project.status = deriveStatus(project);
  project.updatedAt = nowIso();
  project.thumbnailUrl =
    project.scenes.find((scene) => scene.image?.publicUrl)?.image?.publicUrl ?? project.thumbnailUrl;
  return project;
}

export function createSupabaseRepositories(): Repositories {
  const client: SupabaseClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    projects: {
      async list() {
        const { data, error } = await client
          .from('video_projects')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        return (data as ProjectRow[]).map(projectFromRow);
      },
      async get(id) {
        const { data, error } = await client.from('video_projects').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? projectFromRow(data as ProjectRow) : null;
      },
      async getByShareId(shareId) {
        const { data, error } = await client.from('video_projects').select('*').eq('share_id', shareId).maybeSingle();
        if (error) throw error;
        return data ? projectFromRow(data as ProjectRow) : null;
      },
      async save(project) {
        const { error } = await client.from('video_projects').upsert(projectToRow(project));
        if (error) throw error;
        return project;
      },
      async updateDocument(id, mutator) {
        const maxAttempts = 8;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const { data, error } = await client.from('video_projects').select('*').eq('id', id).maybeSingle();
          if (error) throw error;
          if (!data) {
            throw new Error(`Project ${id} not found`);
          }
          const current = projectFromRow(data as ProjectRow);
          const next = finalizeProject(mutator(structuredClone(current)));
          const merged = mergeProjectDocuments(current, next);
          const row = projectToRow(merged);
          const { data: updated, error: updateError } = await client
            .from('video_projects')
            .update(row)
            .eq('id', id)
            .eq('updated_at', current.updatedAt)
            .select('*')
            .maybeSingle();
          if (updateError) throw updateError;
          if (updated) {
            return projectFromRow(updated as ProjectRow);
          }
        }
        throw new Error(`Project ${id} update conflict after ${maxAttempts} attempts`);
      },
      async delete(id) {
        await client.from('video_ai_usage_logs').delete().eq('project_id', id);
        await client.from('video_render_jobs').delete().eq('project_id', id);
        await client.from('video_pipeline_jobs').delete().eq('project_id', id);
        await client.from('video_assets').delete().eq('project_id', id);
        const { error } = await client.from('video_projects').delete().eq('id', id);
        if (error) throw error;
      },
    },
    assets: {
      async listByProject(projectId) {
        const { data, error } = await client
          .from('video_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data as AssetRow[]).map(assetFromRow);
      },
      async get(id) {
        const { data, error } = await client.from('video_assets').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? assetFromRow(data as AssetRow) : null;
      },
      async save(asset) {
        const { error } = await client.from('video_assets').upsert({
          id: asset.id,
          project_id: asset.projectId,
          type: asset.type,
          source: asset.source,
          storage_path: asset.storagePath,
          public_url: asset.publicUrl,
          mime_type: asset.mimeType,
          width: asset.width ?? null,
          height: asset.height ?? null,
          duration_seconds: asset.durationSeconds ?? null,
          file_size_bytes: asset.fileSizeBytes ?? null,
          metadata_json: asset.metadata ?? {},
          created_at: asset.createdAt,
        });
        if (error) throw error;
        return asset;
      },
    },
    renderJobs: {
      async listByProject(projectId) {
        const { data, error } = await client
          .from('video_render_jobs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data as RenderJobRow[]).map(renderJobFromRow);
      },
      async get(id) {
        const { data, error } = await client.from('video_render_jobs').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? renderJobFromRow(data as RenderJobRow) : null;
      },
      async save(job) {
        const { error } = await client.from('video_render_jobs').upsert({
          id: job.id,
          project_id: job.projectId,
          status: job.status,
          progress: job.progress,
          created_at: job.createdAt,
          started_at: job.startedAt ?? null,
          completed_at: job.completedAt ?? null,
          output_url: job.outputUrl ?? null,
          output_asset_id: job.outputAssetId ?? null,
          error: job.error ?? null,
          claimed_by: job.claimedBy ?? null,
          file_size_bytes: job.fileSizeBytes ?? null,
          progress_updated_at: job.progressUpdatedAt ?? null,
        });
        if (error) throw error;
        return job;
      },
      async claimNext(workerId: string) {
        const { data, error } = await client.rpc('video_claim_render_job', { worker_id: workerId });
        if (error) throw error;
        return parseClaimedRow<RenderJobRow, RenderJob>(data, renderJobFromRow);
      },
    },
    pipelineJobs: {
      async listByProject(projectId) {
        const { data, error } = await client
          .from('video_pipeline_jobs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data as PipelineJobRow[]).map(pipelineJobFromRow);
      },
      async get(id) {
        const { data, error } = await client.from('video_pipeline_jobs').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? pipelineJobFromRow(data as PipelineJobRow) : null;
      },
      async getActiveByProject(projectId) {
        const { data, error } = await client
          .from('video_pipeline_jobs')
          .select('*')
          .eq('project_id', projectId)
          .in('status', ['queued', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data ? pipelineJobFromRow(data as PipelineJobRow) : null;
      },
      async save(job) {
        const { error } = await client.from('video_pipeline_jobs').upsert(pipelineJobToRow(job));
        if (error) throw error;
        return job;
      },
      async claimNext(workerId: string) {
        const { data, error } = await client.rpc('video_claim_pipeline_job', { worker_id: workerId });
        if (error) throw error;
        return parseClaimedRow<PipelineJobRow, PipelineJob>(data, pipelineJobFromRow);
      },
    },
    aiLogs: {
      async add(log: AiUsageLog) {
        const { error } = await client.from('video_ai_usage_logs').insert({
          id: log.id,
          operation: log.operation,
          project_id: log.projectId ?? null,
          provider: log.provider,
          model: log.model,
          status: log.status,
          started_at: log.startedAt,
          completed_at: log.completedAt ?? null,
          error: log.error ?? null,
          prompt_tokens: log.promptTokens ?? null,
          completion_tokens: log.completionTokens ?? null,
          total_tokens: log.totalTokens ?? null,
        });
        if (error) throw error;
      },
    },
    async recoverInterruptedJobs() {
      const pipeline = await recoverOrphanedPipelineJobs(client);
      const render = await recoverOrphanedRenderJobs(client);
      return { pipeline, render };
    },
    async recoverOrphanedRenderJobs(exceptJobId?: string) {
      return recoverOrphanedRenderJobs(client, exceptJobId);
    },
  };
}

async function recoverOrphanedPipelineJobs(client: SupabaseClient): Promise<number> {
  const { data: pipelineRows, error: pipelineError } = await client
    .from('video_pipeline_jobs')
    .update({ status: 'queued', claimed_by: null })
    .eq('status', 'running')
    .select('id');
  if (pipelineError) throw pipelineError;
  return pipelineRows?.length ?? 0;
}

async function recoverOrphanedRenderJobs(
  client: SupabaseClient,
  exceptJobId?: string,
): Promise<number> {
  let query = client
    .from('video_render_jobs')
    .update({
      status: 'queued',
      claimed_by: null,
      started_at: null,
      progress: 0,
      progress_updated_at: null,
      error: null,
    })
    .in('status', ['preparing', 'rendering', 'uploading']);

  if (exceptJobId) {
    query = query.neq('id', exceptJobId);
  }

  const { data: renderRows, error: renderError } = await query.select('id');
  if (renderError) throw renderError;
  return renderRows?.length ?? 0;
}
