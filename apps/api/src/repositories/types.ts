import type { AiUsageLog, AssetRecord, MusicVideoProject, PipelineJob, RenderJob } from '@music-video/shared';

export interface AppDatabase {
  projects: Record<string, MusicVideoProject>;
  assets: Record<string, AssetRecord>;
  renderJobs: Record<string, RenderJob>;
  pipelineJobs: Record<string, PipelineJob>;
  aiLogs: AiUsageLog[];
}

export interface Repositories {
  projects: {
    list(): Promise<MusicVideoProject[]>;
    get(id: string): Promise<MusicVideoProject | null>;
    getByShareId(shareId: string): Promise<MusicVideoProject | null>;
    save(project: MusicVideoProject): Promise<MusicVideoProject>;
    updateDocument(
      id: string,
      mutator: (project: MusicVideoProject) => MusicVideoProject,
    ): Promise<MusicVideoProject>;
    delete(id: string): Promise<void>;
  };
  assets: {
    listByProject(projectId: string): Promise<AssetRecord[]>;
    get(id: string): Promise<AssetRecord | null>;
    save(asset: AssetRecord): Promise<AssetRecord>;
  };
  renderJobs: {
    listByProject(projectId: string): Promise<RenderJob[]>;
    get(id: string): Promise<RenderJob | null>;
    save(job: RenderJob): Promise<RenderJob>;
    claimNext(workerId: string): Promise<RenderJob | null>;
  };
  pipelineJobs: {
    listByProject(projectId: string): Promise<PipelineJob[]>;
    get(id: string): Promise<PipelineJob | null>;
    getActiveByProject(projectId: string): Promise<PipelineJob | null>;
    save(job: PipelineJob): Promise<PipelineJob>;
    claimNext(workerId: string): Promise<PipelineJob | null>;
  };
  aiLogs: {
    add(log: AiUsageLog): Promise<void>;
  };
  recoverInterruptedJobs(): Promise<{ pipeline: number; render: number }>;
  recoverOrphanedRenderJobs(exceptJobId?: string): Promise<number>;
}
