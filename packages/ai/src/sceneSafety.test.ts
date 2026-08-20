import { describe, expect, it } from 'vitest';
import { rewriteSceneTextLocallyForSafety } from './sceneSafety.js';

describe('rewriteSceneTextLocallyForSafety', () => {
  const scene = {
    description: 'Burnt food on the stove with the captain hair smoking.',
    action: 'Kapten holds a charred lump while smoke rises from his hair.',
    imagePrompt: 'burnt food, hair smoking, bränskrot',
    visualComedy: 'A crispy black lump and smoldering hair.',
  };

  it('softens description-related fields only', () => {
    const result = rewriteSceneTextLocallyForSafety(scene, 'description');
    expect(result.description).toContain('cartoon steam');
    expect(result.action).toContain('cartoon steam');
    expect(result.visualComedy).toContain('overcooked cartoon food');
    expect(result.imagePrompt).toBe(scene.imagePrompt);
  });

  it('softens image prompt only', () => {
    const result = rewriteSceneTextLocallyForSafety(scene, 'imagePrompt');
    expect(result.imagePrompt).toContain('cartoon steam');
    expect(result.description).toBe(scene.description);
    expect(result.action).toBe(scene.action);
  });

  it('softens all image-related text', () => {
    const result = rewriteSceneTextLocallyForSafety(scene, 'all');
    expect(result.description).toContain('cartoon steam');
    expect(result.imagePrompt).toContain('cartoon steam');
  });
});
