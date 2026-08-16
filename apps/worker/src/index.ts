import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { projectToComposition } from '@music-video/video';
import type { MusicVideoProject, RenderJob } from '@music-video/shared';
import { config } from '../../api/src/config.js';
import { getRepositories } from '../../api/src/repositories/index.js';
import { getProjectOrThrow, saveProject, storeGeneratedFile } from '../../api/src/services/projects.js';
import { getObjectStorage } from '../../api/src/storage/index.js';
import { runPipelineJob } from './pipelineRunner.js';

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const videoEntry = path.resolve(here, '../../../packages/video/src/entry.ts');

async function claimPipeline() {
  return getRepositories().pipelineJobs.claimNext(config.workerId);
}

async function claimRender(): Promise<RenderJob | null> {
  return getRepositories().renderJobs.claimNext(config.workerId);
}

async function patchRenderJob(job: RenderJob, patch: Partial<RenderJob>): Promise<RenderJob> {
  const next = { ...job, ...patch };
  await getRepositories().renderJobs.save(next);
  return next;
}

async function renderJob(job: RenderJob): Promise<void> {
  let current = await patchRenderJob(job, { status: 'preparing', progress: 2 });
  const project = await getProjectOrThrow(job.projectId);
  const tmp = await mkdir(path.join(os.tmpdir(), `mv-render-${job.id}`), { recursive: true });
  const workdir = tmp ?? path.join(os.tmpdir(), `mv-render-${job.id}`);

  const compositionProject = projectToComposition(project);
  const inputProps = { project: compositionProject };

  current = await patchRenderJob(current, { status: 'rendering', progress: 8 });
  const reportProgress = (progress: number) => {
    current = { ...current, progress };
    void patchRenderJob(current, { progress });
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
  const silentOutput = path.join(workdir, 'silent.mp4');
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: silentOutput,
    inputProps: { ...inputProps, includeAudio: false },
    timeoutInMilliseconds: 1000 * 60 * 30,
    onProgress: ({ progress }) => {
      reportProgress(20 + Math.round(progress * 68));
    },
  });
  const output = await muxOriginalAudio(project, workdir, silentOutput);
  reportProgress(90);

  current = await patchRenderJob(current, { status: 'uploading', progress: 92 });
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
  await patchRenderJob(current, {
    status: 'complete',
    progress: 100,
    completedAt: new Date().toISOString(),
    outputUrl: asset.publicUrl,
    outputAssetId: asset.id,
    fileSizeBytes: info.size,
  });
  const { renderCompositionFingerprint } = await import('@music-video/shared');
  const { ensureShareId } = await import('../../api/src/services/pipeline.js');
  await saveProject({
    ...project,
    status: 'complete',
    lastError: undefined,
    renderFingerprint: renderCompositionFingerprint(project),
    lastRenderJobId: job.id,
  });
  await ensureShareId(project.id);
}

async function failRender(job: RenderJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Render failed.';
  console.error('[worker]', job.id, message);
  await patchRenderJob(job, {
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

async function failPipeline(jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Pipeline failed.';
  console.error('[worker] pipeline', jobId, message);
}

async function loop(): Promise<void> {
  console.log(`Worker ${config.workerId} polling every ${config.workerPollMs}ms`);
  for (;;) {
    try {
      const pipelineJob = await claimPipeline();
      if (pipelineJob) {
        console.log(`Claimed pipeline job ${pipelineJob.id} (${pipelineJob.kind})`);
        try {
          await runPipelineJob(pipelineJob);
          console.log(`Finished pipeline job ${pipelineJob.id}`);
        } catch (error) {
          await failPipeline(pipelineJob.id, error);
        }
        continue;
      }

      const job = await claimRender();
      if (job) {
        console.log(`Claimed render job ${job.id}`);
        try {
          await renderJob(job);
          console.log(`Finished render job ${job.id}`);
        } catch (error) {
          await failRender(job, error);
        }
      }
    } catch (error) {
      console.error('[worker] poll error', error);
    }
    await new Promise((r) => setTimeout(r, config.workerPollMs));
  }
}

async function muxOriginalAudio(
  project: MusicVideoProject,
  workdir: string,
  videoPath: string,
): Promise<string> {
  const audioPath = await writeAudioTemp(project, workdir);
  if (!audioPath) return videoPath;
  const muxed = path.join(workdir, 'out.mp4');
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-shortest',
      '-movflags',
      '+faststart',
      muxed,
    ],
    { timeout: 1000 * 60 * 10 },
  );
  return muxed;
}

async function writeAudioTemp(project: MusicVideoProject, workdir: string): Promise<string | null> {
  if (!project.audio?.assetId) return null;
  const asset = await getRepositories().assets.get(project.audio.assetId);
  if (!asset) return null;
  const file = await getObjectStorage().get(asset.storagePath);
  if (!file) return null;
  const ext = path.extname(asset.storagePath) || '.mp3';
  const dest = path.join(workdir, `source${ext}`);
  await writeFile(dest, file.body);
  return dest;
}

function healthCheck(): void {
  void execFileAsync('ffmpeg', ['-version'])
    .then(() => console.log('ffmpeg: ok'))
    .catch(() => console.warn('ffmpeg not found. Install ffmpeg before rendering MP4s.'));
}

healthCheck();
loop().catch((error) => {
  console.error(error);
  process.exit(1);
});
