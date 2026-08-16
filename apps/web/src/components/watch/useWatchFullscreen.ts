import { useCallback, useEffect, useState, type RefObject } from 'react';

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

export function useWatchFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);

  const syncFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    const active = Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
    setFullscreen(active);
  }, []);

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, [syncFullscreen]);

  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current as FullscreenElement | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // Ignore if the browser blocks fullscreen.
    }
  }, [containerRef]);

  const exitFullscreen = useCallback(async () => {
    const doc = document as FullscreenDocument;
    try {
      if (doc.fullscreenElement && doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Ignore if exit fails.
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (fullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, fullscreen]);

  return { fullscreen, enterFullscreen, exitFullscreen, toggleFullscreen };
}
