import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { projectToComposition } from '@music-video/video';
import type { RenderJob } from '@music-video/shared';
import { config } from '../../api/src/config.js';
import { getRepositories } from '../../api/src/repositories/index.js';
import { getProjectOrThrow, saveProject, storeGeneratedFile } from '../../api/src/services/projects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const videoEntry = path.resolve(here, '../../../packages/video/src/entry.ts');

async function claim(): Promise<RenderJob | null> {
  return getRepositories().renderJobs.claimNext(config.workerId);
}

async function patchJob(job: RenderJob, patch: Partial<RenderJob>): Promise<RenderJob> {
  const next = { ...job, ...patch };
  await getRepositories().renderJobs.save(next);
  return next;
}

async function renderJob(job: RenderJob): Promise<void> {
  let current = await patchJob(job, { status: 'preparing', progress: 2 });
  const project = await getProjectOrThrow(job.projectId);
  const tmp = await mkdir(path.join(os.tmpdir(), `mv-render-${job.id}`), { recursive: true });
  const workdir = tmp ?? path.join(os.tmpdir(), `mv-render-${job.id}`);

  const compositionProject = projectToComposition(project);
  const inputProps = { project: compositionProject };

  current = await patchJob(current, { status: 'rendering', progress: 8 });
  const reportProgress = (progress: number) => {
    current = { ...current, progress };
    void patchJob(current, { progress });
  };
  const bundled = await bundle({
    entryPoint: videoEntry,
    webpackOverride: (webpackConfig) => {
      webpackConfig.resolve = webpackConfig.resolve ?? {};
      webpackConfig.resolve.extensionAlias = {
        ...webpackConfig.resolve.extensionAlias,
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
      };
      return webpackConfig;
    },
    onProgress: (progress) => {
      reportProgress(Math.min(20, 8 + Math.round(progress * 12)));
    },
  });
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'MusicVideo',
    inputProps,
  });
  const output = path.join(workdir, 'out.mp4');
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: output,
    inputProps,
    timeoutInMilliseconds: 1000 * 60 * 30,
    onProgress: ({ progress }) => {
      reportProgress(20 + Math.round(progress * 70));
    },
  });

  current = await patchJob(current, { status: 'uploading', progress: 92 });
  const { readFile, stat } = await import('node:fs/promises');
  const bytes = await readFile(output);
  const info = await stat(output);
  const asset = await storeGeneratedFile({
    projectId: project.id,
    type: 'final_video',
    source: 'upload',
    filename: 'music-video.mp4',
    body: bytes,
    mimeType: 'video/mp4',
    durationSeconds: project.durationSeconds,
  });
  await patchJob(current, {
    status: 'complete',
    progress: 100,
    completedAt: new Date().toISOString(),
    outputUrl: asset.publicUrl,
    outputAssetId: asset.id,
    fileSizeBytes: info.size,
  });
  await saveProject({
    ...project,
    status: 'complete',
    lastError: undefined,
  });
}

async function fail(job: RenderJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Render failed.';
  console.error('[worker]', job.id, message);
  await patchJob(job, {
    status: 'failed',
    error: message,
    completedAt: new Date().toISOString(),
  });
  try {
    const project = await getProjectOrThrow(job.projectId);
    await saveProject({ ...project, status: 'error', lastError: message });
  } catch {
    // ignore
  }
}

async function loop(): Promise<void> {
  console.log(`Worker ${config.workerId} polling every ${config.workerPollMs}ms`);
  for (;;) {
    try {
      const job = await claim();
      if (job) {
        console.log(`Claimed job ${job.id}`);
        try {
          await renderJob(job);
          console.log(`Finished job ${job.id}`);
        } catch (error) {
          await fail(job, error);
        }
      }
    } catch (error) {
      console.error('[worker] poll error', error);
    }
    await new Promise((r) => setTimeout(r, config.workerPollMs));
  }
}

function healthCheck(): void {
  const execFileAsync = promisify(execFile);
  void execFileAsync('ffmpeg', ['-version'])
    .then(() => console.log('ffmpeg: ok'))
    .catch(() => console.warn('ffmpeg not found. Install ffmpeg before rendering MP4s.'));
}

healthCheck();
loop().catch((error) => {
  console.error(error);
  process.exit(1);
});
