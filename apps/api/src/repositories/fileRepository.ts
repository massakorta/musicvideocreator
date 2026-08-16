import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AiUsageLog, AssetRecord, RenderJob } from '@music-video/shared';
import { config } from '../config.js';
import type { AppDatabase, Repositories } from './types.js';

const dbPath = path.join(config.dataDir, 'store', 'db.json');
let writeQueue: Promise<void> = Promise.resolve();

const emptyDb = (): AppDatabase => ({
  projects: {},
  assets: {},
  renderJobs: {},
  aiLogs: [],
});

async function readDb(): Promise<AppDatabase> {
  try {
    const raw = await readFile(dbPath, 'utf8');
    return { ...emptyDb(), ...(JSON.parse(raw) as AppDatabase) };
  } catch {
    return emptyDb();
  }
}

async function writeDb(mutator: (db: AppDatabase) => void | Promise<void>): Promise<AppDatabase> {
  const run = writeQueue.then(async () => {
    await mkdir(path.dirname(dbPath), { recursive: true });
    const db = await readDb();
    await mutator(db);
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    return db;
  });
  writeQueue = run.then(() => undefined).catch(() => undefined);
  return run;
}

export function createFileRepositories(): Repositories {
  return {
    projects: {
      async list() {
        const db = await readDb();
        return Object.values(db.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async get(id) {
        const db = await readDb();
        return db.projects[id] ?? null;
      },
      async save(project) {
        await writeDb((db) => {
          db.projects[project.id] = project;
        });
        return project;
      },
      async delete(id) {
        await writeDb((db) => {
          delete db.projects[id];
          for (const [assetId, asset] of Object.entries(db.assets)) {
            if (asset.projectId === id) delete db.assets[assetId];
          }
          for (const [jobId, job] of Object.entries(db.renderJobs)) {
            if (job.projectId === id) delete db.renderJobs[jobId];
          }
        });
      },
    },
    assets: {
      async listByProject(projectId) {
        const db = await readDb();
        return Object.values(db.assets)
          .filter((a) => a.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async get(id) {
        const db = await readDb();
        return db.assets[id] ?? null;
      },
      async save(asset: AssetRecord) {
        await writeDb((db) => {
          db.assets[asset.id] = asset;
        });
        return asset;
      },
    },
    renderJobs: {
      async listByProject(projectId) {
        const db = await readDb();
        return Object.values(db.renderJobs)
          .filter((j) => j.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async get(id) {
        const db = await readDb();
        return db.renderJobs[id] ?? null;
      },
      async save(job: RenderJob) {
        await writeDb((db) => {
          db.renderJobs[job.id] = job;
        });
        return job;
      },
      async claimNext(workerId: string) {
        let claimed: RenderJob | null = null;
        await writeDb((db) => {
          const next = Object.values(db.renderJobs)
            .filter((j) => j.status === 'queued')
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
          if (!next) return;
          next.status = 'preparing';
          next.claimedBy = workerId;
          next.startedAt = new Date().toISOString();
          db.renderJobs[next.id] = next;
          claimed = next;
        });
        return claimed;
      },
    },
    aiLogs: {
      async add(log: AiUsageLog) {
        await writeDb((db) => {
          db.aiLogs.unshift(log);
          db.aiLogs = db.aiLogs.slice(0, 500);
        });
      },
    },
  };
}
