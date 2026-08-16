import type { AiUsageLog, AssetRecord, MusicVideoProject, RenderJob } from '@music-video/shared';

export interface AppDatabase {
  projects: Record<string, MusicVideoProject>;
  assets: Record<string, AssetRecord>;
  renderJobs: Record<string, RenderJob>;
  aiLogs: AiUsageLog[];
}

export interface Repositories {
  projects: {
    list(): Promise<MusicVideoProject[]>;
    get(id: string): Promise<MusicVideoProject | null>;
    save(project: MusicVideoProject): Promise<MusicVideoProject>;
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
  aiLogs: {
    add(log: AiUsageLog): Promise<void>;
  };
}
