const activeGenerations = new Set<string>();

export function sceneGenerationKey(projectId: string, sceneId: string): string {
  return `${projectId}:${sceneId}`;
}

export function isSceneGenerationActive(projectId: string, sceneId: string): boolean {
  return activeGenerations.has(sceneGenerationKey(projectId, sceneId));
}

export function tryAcquireSceneGeneration(projectId: string, sceneId: string): boolean {
  const key = sceneGenerationKey(projectId, sceneId);
  if (activeGenerations.has(key)) return false;
  activeGenerations.add(key);
  return true;
}

export function releaseSceneGeneration(projectId: string, sceneId: string): void {
  activeGenerations.delete(sceneGenerationKey(projectId, sceneId));
}

export function sceneVideoGenerationKey(projectId: string, sceneId: string): string {
  return `${projectId}:${sceneId}:video`;
}

export function tryAcquireSceneVideoGeneration(projectId: string, sceneId: string): boolean {
  const key = sceneVideoGenerationKey(projectId, sceneId);
  if (activeGenerations.has(key)) return false;
  activeGenerations.add(key);
  return true;
}

export function isSceneVideoGenerationActive(projectId: string, sceneId: string): boolean {
  return activeGenerations.has(sceneVideoGenerationKey(projectId, sceneId));
}

export function releaseSceneVideoGeneration(projectId: string, sceneId: string): void {
  activeGenerations.delete(sceneVideoGenerationKey(projectId, sceneId));
}
