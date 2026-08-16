import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { projectToComposition } from '@music-video/video';
import {
  EXPORT_AUDIO_BITRATE,
  EXPORT_CRF,
  getExportPreset,
  secondsToFrames,
  type MusicVideoProject,
  type RenderJob,
} from '@music-video/shared';
import { config, supabaseConfigured } from '../../api/src/config.js';
import { getRepositories } from '../../api/src/repositories/index.js';
import { getProjectOrThrow, saveProject, storeGeneratedFileFromPath } from '../../api/src/services/projects.js';
import { getObjectStorage } from '../../api/src/storage/index.js';
import { runPipelineJob, type PipelineRunOptions } from './pipelineRunner.js';
import {
  isRenderBlockedByPipeline,
  setPipelineHeavy,
  setPipelineWaitingForRender,
} from './heavyWork.js';

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const videoEntry = path.resolve(here, '../../../packages/video/src/entry.ts');
const IDLE_HEARTBEAT_MS = 60_000;
const OFFTHREAD_CACHE_BYTES = 8 * 1024 * 1024;

let cachedServeUrl: string | undefined;
let lastRenderBlockedLogAt = 0;

function effectiveRemotionConcurrency(): number {
  return Math.min(Math.max(1, config.remotionConcurrency), os.availableParallelism());
}

function renderLog(
  job: RenderJob,
  project: MusicVideoProject,
  message: string,
  details?: Record<string, string | number | boolean | undefined>,
): void {
  const suffix = details
    ? ` ${Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')}`
    : '';
  console.log(`[render] job=${job.id} project="${project.name}" (${project.id}) ${message}${suffix}`);
}

function logRenderBlocked(): void {
  const now = Date.now();
  if (now - lastRenderBlockedLogAt < IDLE_HEARTBEAT_MS) return;
  lastRenderBlockedLogAt = now;
  console.log('[render] waiting for pipeline work to finish before claiming another render job');
}

function logMemory(label: string): void {
  const { rss, heapUsed, heapTotal } = process.memoryUsage();
  const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`;
  console.log(`[worker] mem ${label}: rss=${mb(rss)} heap=${mb(heapUsed)}/${mb(heapTotal)}`);
}

function prebuiltBundleDir(): string {
  return config.remotionBundleDir || path.resolve(here, '../../../packages/video/dist/bundle');
}

async function getServeUrl(onProgress: (progress: number) => void): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl;
  const prebuilt = prebuiltBundleDir();
  try {
    const { access } = await import('node:fs/promises');
    await access(path.join(prebuilt, 'index.html'));
    console.log('[worker] using prebuilt Remotion bundle', prebuilt);
    cachedServeUrl = prebuilt;
    return cachedServeUrl;
  } catch {
    console.log('[worker] no prebuilt Remotion bundle, bundling with webpack');
  }
  const { bundle } = await import('@remotion/bundler');
  cachedServeUrl = await bundle({
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
      onProgress(Math.min(20, 8 + Math.round(progress * 12)));
    },
  });
  return cachedServeUrl;
}

function assertJobStore(): void {
  if (supabaseConfigured()) {
    const host = new URL(config.supabaseUrl).host;
    console.log(`Using Supabase job store at ${host}`);
    return;
  }
  console.warn(`Using local file job store (${config.dataDir})`);
  if (config.isProduction) {
    console.error('Production worker requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
}

async function recoverInterruptedJobs(): Promise<void> {
  const { pipeline, render } = await getRepositories().recoverInterruptedJobs();
  if (pipeline || render) {
    console.log(`Recovered ${pipeline} pipeline and ${render} render jobs back to queued`);
  }
}

const pipelineRunOptions: PipelineRunOptions = {
  onRenderWaitStart: () => setPipelineWaitingForRender(true),
  onRenderWaitEnd: () => setPipelineWaitingForRender(false),
};

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
  const workdir = path.join(os.tmpdir(), `mv-render-${job.id}`);
  await mkdir(workdir, { recursive: true });
  const exportPreset = getExportPreset(project.formatId);
  const durationSeconds = project.audio?.durationSeconds ?? project.durationSeconds;
  const durationInFrames = Math.max(1, secondsToFrames(durationSeconds, exportPreset.fps));
  renderLog(job, project, 'started', {
    durationSeconds,
    scenes: project.scenes.length,
    export: `${exportPreset.width}x${exportPreset.height}@${exportPreset.fps}fps`,
    frames: durationInFrames,
    crf: EXPORT_CRF,
    concurrency: effectiveRemotionConcurrency(),
  });
  logMemory(`render ${job.id} start`);

  try {
    const compositionProject = projectToComposition(project);
    const inputProps = { project: compositionProject };

    current = await patchRenderJob(current, { status: 'rendering', progress: 8 });
    renderLog(job, project, 'preparing Remotion bundle');
    let lastLoggedProgress = -1;
    const reportProgress = (progress: number, stage: string) => {
      current = { ...current, progress };
      void patchRenderJob(current, { progress });
      const bucket = Math.floor(progress / 10) * 10;
      if (bucket > lastLoggedProgress) {
        lastLoggedProgress = bucket;
        renderLog(job, project, stage, { progress: `${progress}%` });
      }
    };
    const serveUrl = await getServeUrl((progress) => reportProgress(progress, 'bundling'));
    reportProgress(20, 'bundle ready');
    const composition = await selectComposition({
      serveUrl,
      id: 'MusicVideo',
      inputProps,
    });
    const exportComposition = {
      ...composition,
      width: exportPreset.width,
      height: exportPreset.height,
      fps: exportPreset.fps,
      durationInFrames,
    };
    renderLog(job, project, 'rendering frames', {
      frames: durationInFrames,
      export: `${exportPreset.width}x${exportPreset.height}@${exportPreset.fps}fps`,
    });
    lastLoggedProgress = 20;
    const silentOutput = path.join(workdir, 'silent.mp4');
    await renderMedia({
      composition: exportComposition,
      serveUrl,
      codec: 'h264',
      crf: EXPORT_CRF,
      outputLocation: silentOutput,
      inputProps: { ...inputProps, includeAudio: false },
      timeoutInMilliseconds: 1000 * 60 * 30,
      concurrency: effectiveRemotionConcurrency(),
      chromiumOptions: {
        enableMultiProcessOnLinux: false,
        gl: 'swangle',
      },
      disallowParallelEncoding: true,
      offthreadVideoCacheSizeInBytes: OFFTHREAD_CACHE_BYTES,
      onProgress: ({ progress }) => {
        reportProgress(20 + Math.round(progress * 68), 'rendering');
      },
    });
    logMemory(`render ${job.id} encoded`);
    renderLog(job, project, 'muxing original audio');
    const output = await muxOriginalAudio(project, workdir, silentOutput);
    reportProgress(90, 'audio muxed');

    current = await patchRenderJob(current, { status: 'uploading', progress: 92 });
    renderLog(job, project, 'uploading finished MP4');
    const { stat } = await import('node:fs/promises');
    const info = await stat(output);
    const asset = await storeGeneratedFileFromPath({
      projectId: project.id,
      type: 'final_video',
      source: 'upload',
      filename: 'music-video.mp4',
      filePath: output,
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
    renderLog(job, project, 'complete', {
      sizeMb: `${(info.size / (1024 * 1024)).toFixed(1)}MB`,
      outputUrl: asset.publicUrl,
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
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    logMemory(`render ${job.id} done`);
  }
}

async function failRender(job: RenderJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Render failed.';
  try {
    const project = await getProjectOrThrow(job.projectId);
    console.error(`[render] failed job=${job.id} project="${project.name}" (${project.id}) ${message}`);
  } catch {
    console.error(`[render] failed job=${job.id} project=${job.projectId} ${message}`);
  }
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

async function pipelineLoop(): Promise<void> {
  let lastActivity = Date.now();
  for (;;) {
    try {
      const pipelineJob = await claimPipeline();
      if (pipelineJob?.id) {
        lastActivity = Date.now();
        console.log(`Claimed pipeline job ${pipelineJob.id} (${pipelineJob.kind})`);
        setPipelineHeavy(true);
        try {
          await runPipelineJob(pipelineJob, pipelineRunOptions);
          console.log(`Finished pipeline job ${pipelineJob.id}`);
        } catch (error) {
          await failPipeline(pipelineJob.id, error);
        } finally {
          setPipelineHeavy(false);
          setPipelineWaitingForRender(false);
        }
      } else if (Date.now() - lastActivity >= IDLE_HEARTBEAT_MS) {
        console.log('[worker] pipeline loop: no queued jobs');
        lastActivity = Date.now();
      }
    } catch (error) {
      console.error('[worker] pipeline poll error', error);
    }
    await new Promise((r) => setTimeout(r, config.workerPollMs));
  }
}

async function renderLoop(): Promise<void> {
  let lastActivity = Date.now();
  for (;;) {
    try {
      if (isRenderBlockedByPipeline()) {
        logRenderBlocked();
        await new Promise((r) => setTimeout(r, config.workerPollMs));
        continue;
      }

      const job = await claimRender();
      if (job?.id) {
        lastActivity = Date.now();
        try {
          const project = await getProjectOrThrow(job.projectId);
          renderLog(job, project, 'claimed from queue');
        } catch {
          console.log(`[render] claimed job=${job.id} project=${job.projectId}`);
        }
        try {
          await renderJob(job);
        } catch (error) {
          await failRender(job, error);
        }
      } else if (Date.now() - lastActivity >= IDLE_HEARTBEAT_MS) {
        console.log('[worker] render loop: no queued jobs');
        lastActivity = Date.now();
      }
    } catch (error) {
      console.error('[worker] render poll error', error);
    }
    await new Promise((r) => setTimeout(r, config.workerPollMs));
  }
}

function start(): void {
  assertJobStore();
  healthCheck();
  logMemory('boot');
  console.log(`Worker ${config.workerId} polling every ${config.workerPollMs}ms`);
  void recoverInterruptedJobs().finally(() => {
    Promise.all([pipelineLoop(), renderLoop()]).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
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
      EXPORT_AUDIO_BITRATE,
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

start();
