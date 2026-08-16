import { createApp } from './app.js';
import { config, openaiConfigured } from './config.js';
import { removeLegacyDemoProjects } from './seed/removeLegacyDemoProjects.js';

const app = createApp();

app.listen(config.apiPort, async () => {
  console.log(`API listening on ${config.apiUrl}`);
  console.log(
    `OpenAI: ${openaiConfigured() ? 'live' : 'demo mode (set OPENAI_API_KEY and restart)'} · model ${config.openaiTextModel} / ${config.openaiImageModel}`,
  );
  try {
    const removed = await removeLegacyDemoProjects();
    if (removed > 0) {
      console.log(`Removed ${removed} legacy demo project${removed === 1 ? '' : 's'}.`);
    }
  } catch (error) {
    console.warn('Legacy demo cleanup skipped:', error instanceof Error ? error.message : error);
  }
});
