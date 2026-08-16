import { createDemoProject } from './demoProject.js';

const project = await createDemoProject();
console.log(`Seeded demo project ${project.id} (${project.name})`);
