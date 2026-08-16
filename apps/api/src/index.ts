import { createApp } from './app.js';
import { config, openaiConfigured } from './config.js';
import { ensureDemoProject } from './seed/demoProject.js';

const app = createApp();

app.listen(config.apiPort, async () => {
  console.log(`API listening on ${config.apiUrl}`);
  console.log(
    `OpenAI: ${openaiConfigured() ? 'live' : 'demo mode (set OPENAI_API_KEY and restart)'} · model ${config.openaiTextModel} / ${config.openaiImageModel}`,
  );
  try {
    await ensureDemoProject();
  } catch (error) {
    console.warn('Demo seed skipped:', error instanceof Error ? error.message : error);
  }
});
