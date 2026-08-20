import { createApp } from './app.js';
import { config, falConfigured, openaiConfigured } from './config.js';
import { ensureFalConfigured } from '@music-video/ai';
import { removeLegacyDemoProjects } from './seed/removeLegacyDemoProjects.js';

if (falConfigured()) {
  ensureFalConfigured(config.falKey);
}

const app = createApp();

app.listen(config.apiPort, async () => {
  console.log(`API listening on ${config.apiUrl}`);
  console.log(
    `OpenAI text: ${openaiConfigured() ? 'live' : 'demo (set OPENAI_API_KEY)'} · model ${config.openaiTextModel}`,
  );
  console.log(
    `fal.ai stills: ${falConfigured() ? 'live' : 'demo (set FAL_KEY)'} · Flux via quality presets`,
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
