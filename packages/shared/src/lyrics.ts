import type { SongSection } from './status.js';

export function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function classifySongSection(label: string): SongSection {
  const v = label.toLowerCase();
  if (v.includes('intro')) return 'intro';
  if ((v.includes('pre') && v.includes('chorus')) || v.includes('förrefräng') || v.includes('forrefrang')) {
    return 'prechorus';
  }
  if (v.includes('chorus') || v.includes('refräng') || v.includes('refrang')) return 'chorus';
  if (v.includes('bridge') || v.includes('brygga')) return 'bridge';
  if (v.includes('outro') || v.includes('end') || v.includes('coda')) return 'outro';
  if (v.includes('instrumental') || v.includes('solo') || v.includes('interlude')) return 'instrumental';
  if (v.includes('verse') || v.includes('vers')) return 'verse';
  return 'other';
}

export function parseLyricSections(lyrics: string): Array<{ label: string; lines: string[] }> {
  const lines = lyrics.replace(/\r\n/g, '\n').split('\n');
  const sections: Array<{ label: string; lines: string[] }> = [];
  let current = { label: 'other', lines: [] as string[] };
  const header = /^\s*\[([^\]]+)\]\s*$/;

  for (const line of lines) {
    const match = line.match(header);
    if (match) {
      if (current.lines.length > 0 || sections.length === 0) {
        if (current.lines.length > 0 || current.label !== 'other') sections.push(current);
      }
      current = { label: match[1]!.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.filter((s) => s.lines.some((l) => l.trim().length > 0) || /\w/.test(s.label));
}

export function suggestedSceneCount(durationSeconds: number): { min: number; max: number; target: number } {
  const minutes = durationSeconds / 60;
  const target = Math.round(Math.min(50, Math.max(20, 8 + minutes * 8)));
  return { min: Math.max(12, target - 8), max: Math.min(50, target + 8), target };
}
