/** Keeps pipeline AI/image work and Remotion rendering from running at the same time. */
let pipelineHeavy = false;
let pipelineWaitingForRender = false;

export function setPipelineWaitingForRender(waiting: boolean): void {
  pipelineWaitingForRender = waiting;
}

export function setPipelineHeavy(heavy: boolean): void {
  pipelineHeavy = heavy;
}

export function isRenderBlockedByPipeline(): boolean {
  return pipelineHeavy && !pipelineWaitingForRender;
}

export async function waitUntilRenderAllowed(): Promise<void> {
  while (isRenderBlockedByPipeline()) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
