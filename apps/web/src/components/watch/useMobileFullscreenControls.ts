import { useCallback, useEffect, useRef, useState } from 'react';

const MOBILE_MAX_WIDTH_PX = 719;
const CONTROLS_HIDE_DELAY_MS = 1000;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

export function useMobileFullscreenControls(fullscreen: boolean, playing: boolean) {
  const isMobile = useIsMobileViewport();
  const mobileFullscreen = fullscreen && isMobile;
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(true);
  }, [clearHideTimer]);

  const scheduleHideControls = useCallback(() => {
    clearHideTimer();
    if (!mobileFullscreen || !playing) return;
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      hideTimerRef.current = null;
    }, CONTROLS_HIDE_DELAY_MS);
  }, [clearHideTimer, mobileFullscreen, playing]);

  useEffect(() => {
    if (!mobileFullscreen) {
      clearHideTimer();
      setControlsVisible(true);
      return;
    }

    setControlsVisible(true);
    if (playing) {
      scheduleHideControls();
    }

    return clearHideTimer;
  }, [clearHideTimer, mobileFullscreen, playing, scheduleHideControls]);

  useEffect(() => {
    if (mobileFullscreen && !playing) {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [clearHideTimer, mobileFullscreen, playing]);

  return {
    mobileFullscreen,
    controlsVisible,
    showControls,
    scheduleHideControls,
  };
}
