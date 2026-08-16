export type PublicWatchLyricLine = {
  startTime: number;
  endTime: number;
  text: string;
  section: string;
};

export type PublicWatchLyrics = {
  text: string;
  lines: PublicWatchLyricLine[];
};

export function activeLyricLineIndex(lines: PublicWatchLyricLine[], seconds: number): number {
  if (!lines.length) return -1;
  const index = lines.findIndex((line) => seconds >= line.startTime && seconds < line.endTime);
  if (index >= 0) return index;
  if (seconds < lines[0]!.startTime) return -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (seconds >= lines[i]!.startTime) return i;
  }
  return -1;
}

export function currentLyricLine(lines: PublicWatchLyricLine[], seconds: number): string | null {
  const index = activeLyricLineIndex(lines, seconds);
  return index >= 0 ? lines[index]!.text : null;
}
