import { getRepositories } from '../repositories/index.js';
import { deleteProject } from '../services/projects.js';

export const LEGACY_DEMO_PROJECT_NAME = 'Harbor Lights (Demo)';

export async function removeLegacyDemoProjects(): Promise<number> {
  const projects = await getRepositories().projects.list();
  const legacy = projects.filter((project) => project.name === LEGACY_DEMO_PROJECT_NAME);
  for (const project of legacy) {
    await deleteProject(project.id);
  }
  return legacy.length;
}
