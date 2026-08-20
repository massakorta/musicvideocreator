import { AppError, ERROR_CODES, errorText, sceneHasStill, sceneHasVideo } from '@music-video/shared';
import { createVideoProvider, requireFalOrDemo } from './aiService.js';
import {
  attachVideoToScene,
  getProjectOrThrow,
  storeGeneratedFileFromPath,
  styleOrThrow,
  updateProjectDocument,
} from './projects.js';
import {
  releaseSceneVideoGeneration,
  tryAcquireSceneVideoGeneration,
} from './sceneGenerationLock.js';
import { replaceScenes } from './projectUtils.js';
import { getObjectStorage } from '../storage/index.js';
import { getRepositories } from '../repositories/index.js';
import {
  downloadUrlToFile,
  isPublicRemoteUrl,
  prepareStillForFalUpload,
  prepareVideoFileForStorage,
  removeTempFile,
} from './mediaPrepare.js';

export async function generateSceneVideo(projectId: string, sceneId: string, force = false) {
  const project = await getProjectOrThrow(projectId);
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new AppError(ERROR_CODES.NOT_FOUND, 'That scene could not be found.', 404);
  if (!project.visualBible) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Approve a visual bible first.', 400);
  }
  if (!sceneHasStill(scene)) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Generate a still for this scene before animating it.', 400);
  }
  if (sceneHasVideo(scene) && !force) {
    return { project, asset: scene.video, demo: scene.video?.source === 'demo', started: false };
  }
  if (requireFalOrDemo() === 'demo') {
    throw new AppError(
      ERROR_CODES.VIDEO_FAILED,
      'Scene animation requires fal.ai. Set FAL_KEY to animate stills into clips.',
      502,
    );
  }
  if (!tryAcquireSceneVideoGeneration(projectId, sceneId)) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      'This scene is already being animated. Wait a moment, then retry.',
      409,
    );
  }

  const provider = createVideoProvider();
  if (!provider) {
    releaseSceneVideoGeneration(projectId, sceneId);
    throw new AppError(
      ERROR_CODES.VIDEO_FAILED,
      'Scene animation requires fal.ai. Set FAL_KEY to animate stills into clips.',
      502,
    );
  }

  try {
    await updateProjectDocument(projectId, (latest) =>
      replaceScenes(
        latest,
        latest.scenes.map((s) =>
          s.id === sceneId
            ? { ...s, videoGenerationState: 'generating', videoGenerationError: undefined }
            : s,
        ),
      ),
    );

    console.log(`[video] queued scene ${sceneId} on project ${projectId}`);
    void executeSceneVideoGeneration(projectId, sceneId).catch((error) => {
      console.error(`[video] unhandled failure for ${projectId}/${sceneId}: ${errorText(error)}`);
    });

    return { project: await getProjectOrThrow(projectId), demo: false, started: true };
  } catch (error) {
    releaseSceneVideoGeneration(projectId, sceneId);
    throw error;
  }
}

async function executeSceneVideoGeneration(projectId: string, sceneId: string): Promise<void> {
  const startedAt = Date.now();
  let sceneOrder = 0;
  let readyPath: string | undefined;
  try {
    const project = await getProjectOrThrow(projectId);
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene || !project.visualBible) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'That scene could not be found.', 404);
    }
    sceneOrder = scene.order;
    const style = styleOrThrow(project.styleId);
    const provider = createVideoProvider();
    if (!provider) {
      throw new AppError(
        ERROR_CODES.VIDEO_FAILED,
        'Scene animation requires fal.ai. Set FAL_KEY to animate stills into clips.',
        502,
      );
    }

    const imageAssetId = scene.currentAssetId ?? scene.image?.id;
    if (!imageAssetId) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Generate a still for this scene before animating it.', 400);
    }
    const imageAsset = await getRepositories().assets.get(imageAssetId);
    if (!imageAsset) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'The scene still could not be found.', 404);
    }

    const sourceImageUrl = isPublicRemoteUrl(imageAsset.publicUrl) ? imageAsset.publicUrl : undefined;
    let sourceImageBytes: Buffer | undefined;
    let sourceImageMimeType: string | undefined;
    if (!sourceImageUrl) {
      const stored = await getObjectStorage().get(imageAsset.storagePath);
      if (!stored) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'The scene still file could not be loaded.', 404);
      }
      const stillForFal = await prepareStillForFalUpload(stored.body, stored.mimeType);
      sourceImageBytes = stillForFal.body;
      sourceImageMimeType = stillForFal.mimeType;
    }

    const video = await provider.generateSceneVideo({
      scene,
      bible: project.visualBible,
      style,
      sourceImageUrl,
      sourceImageBytes,
      sourceImageMimeType,
    });

    const rawPath = await downloadUrlToFile(video.videoUrl);
    readyPath = await prepareVideoFileForStorage(rawPath);

    const asset = await storeGeneratedFileFromPath({
      projectId,
      type: 'scene_video',
      source: 'ai',
      filename: `${scene.id}.mp4`,
      filePath: readyPath,
      mimeType: video.mimeType,
      durationSeconds: video.durationSeconds,
      metadata: { sceneId, sourceImageAssetId: imageAssetId, prompt: video.prompt, model: video.model },
    });
    readyPath = undefined;

    await attachVideoToScene(await getProjectOrThrow(projectId), sceneId, asset);
    console.log(
      `[video] complete scene ${sceneId} on project ${projectId} in ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
  } catch (error) {
    const message = errorText(error);
    console.error(
      `[video] failed scene ${sceneId} on project ${projectId} after ${Math.round((Date.now() - startedAt) / 1000)}s: ${message}`,
    );
    await updateProjectDocument(projectId, (latest) =>
      replaceScenes(
        latest,
        latest.scenes.map((s) =>
          s.id === sceneId && !s.currentVideoAssetId
            ? {
                ...s,
                videoGenerationState: 'failed',
                videoGenerationError:
                  error instanceof AppError
                    ? error.message
                    : `Scene ${sceneOrder || s.order} could not be animated. ${errorText(error)}`,
              }
            : s,
        ),
      ),
    ).catch(() => undefined);
  } finally {
    await removeTempFile(readyPath);
    releaseSceneVideoGeneration(projectId, sceneId);
  }
}
