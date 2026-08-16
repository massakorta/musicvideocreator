import { useEffect, useRef } from 'react';
import { parseLyricSections } from '@music-video/shared';
import { activeLyricLineIndex, type PublicWatchLyrics } from './watch/types';

export function WatchLyrics({
  lyrics,
  currentSeconds,
  hidden = false,
}: {
  lyrics?: PublicWatchLyrics;
  currentSeconds: number;
  hidden?: boolean;
}) {
  const activeRef = useRef<HTMLParagraphElement>(null);
  const hasTimedLines = Boolean(lyrics?.lines.length);
  const activeIndex = hasTimedLines && lyrics ? activeLyricLineIndex(lyrics.lines, currentSeconds) : -1;

  useEffect(() => {
    if (!hasTimedLines || activeIndex < 0 || hidden) return;
    activeRef.current?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [activeIndex, hasTimedLines, hidden]);

  if (!lyrics || hidden) return null;

  if (hasTimedLines) {
    return (
      <section className="watch-lyrics" aria-label="Song lyrics">
        <div className="watch-lyrics-scroll">
          {lyrics.lines.map((line, index) => {
            const distance = activeIndex >= 0 ? Math.abs(index - activeIndex) : 99;
            const state =
              index === activeIndex ? 'active' : distance === 1 ? 'near' : distance <= 2 ? 'far' : 'hidden';
            if (state === 'hidden') return null;
            return (
              <p
                key={`${line.startTime}-${index}`}
                ref={index === activeIndex ? activeRef : undefined}
                className={`watch-lyric-line watch-lyric-line--${state}`}
              >
                {line.text}
              </p>
            );
          })}
        </div>
      </section>
    );
  }

  if (!lyrics.text.trim()) return null;

  const sections = parseLyricSections(lyrics.text);

  return (
    <section className="watch-lyrics watch-lyrics--static" aria-label="Song lyrics">
      <div className="watch-lyrics-scroll">
        {sections.map((section) => (
          <div key={section.label} className="watch-lyric-section">
            {section.label !== 'other' ? (
              <p className="watch-lyric-section-label">{section.label}</p>
            ) : null}
            {section.lines.map((line, index) =>
              line.trim() ? (
                <p key={`${section.label}-${index}`} className="watch-lyric-line watch-lyric-line--static">
                  {line}
                </p>
              ) : null,
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
