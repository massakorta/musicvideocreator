import { useCallback, useEffect, useState, type RefObject } from 'react';

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

export function useWatchFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const fullscreen = nativeFullscreen || immersive;

  const syncFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    const active = Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
    setNativeFullscreen(active);
    if (active) {
      setImmersive(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, [syncFullscreen]);

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImmersive(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [immersive]);

  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current as FullscreenElement | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        return;
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        return;
      }
    } catch {
      // Fall back to in-page theater mode when the browser blocks native fullscreen.
    }
    setImmersive(true);
  }, [containerRef]);

  const exitFullscreen = useCallback(async () => {
    setImmersive(false);
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

  return { fullscreen, immersive, nativeFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen };
}
