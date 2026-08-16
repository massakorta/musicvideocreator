import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AiUsageLog, AssetRecord, MusicVideoProject, RenderJob } from '@music-video/shared';
import { config } from '../config.js';
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

interface JobRow {
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
}

function projectFromRow(row: ProjectRow): MusicVideoProject {
  return {
    ...row.document,
    id: row.id,
    name: row.name,
    songTitle: row.song_title,
    status: row.status,
    styleId: row.style_id ?? undefined,
    durationSeconds: Number(row.duration_seconds),
    lyrics: row.lyrics,
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

function jobFromRow(row: JobRow): RenderJob {
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
  };
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
      async save(project) {
        const { error } = await client.from('video_projects').upsert(projectToRow(project));
        if (error) throw error;
        return project;
      },
      async delete(id) {
        await client.from('video_ai_usage_logs').delete().eq('project_id', id);
        await client.from('video_render_jobs').delete().eq('project_id', id);
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
        return (data as JobRow[]).map(jobFromRow);
      },
      async get(id) {
        const { data, error } = await client.from('video_render_jobs').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? jobFromRow(data as JobRow) : null;
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
        });
        if (error) throw error;
        return job;
      },
      async claimNext(workerId: string) {
        const { data, error } = await client.rpc('video_claim_render_job', { worker_id: workerId });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return row ? jobFromRow(row as JobRow) : null;
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
  };
}
