import { useEffect, useRef, type ReactNode } from 'react';
import type { StoryboardScene } from '@music-video/shared';

type SceneCardMediaProps = {
  scene: StoryboardScene;
  previewing: boolean;
  onPreviewChange: (previewing: boolean) => void;
  overlays?: ReactNode;
  className?: string;
};

export function SceneCardMedia({
  scene,
  previewing,
  onPreviewChange,
  overlays,
  className,
}: SceneCardMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipUrl = scene.video?.publicUrl;

  useEffect(() => {
    if (!previewing) {
      videoRef.current?.pause();
    }
  }, [previewing]);

  return (
    <div className={className ? `card-media ${className}` : 'card-media'}>
      {previewing && clipUrl ? (
        <>
          <video
            ref={videoRef}
            className="card-media-video"
            src={clipUrl}
            controls
            autoPlay
            playsInline
            loop
          />
          <button
            type="button"
            className="card-media-toggle btn btn-ghost"
            onClick={() => onPreviewChange(false)}
          >
            Still
          </button>
        </>
      ) : scene.image?.publicUrl ? (
        <img src={scene.image.publicUrl} alt={scene.title} />
      ) : null}
      {!previewing && clipUrl ? (
        <button
          type="button"
          className="card-media-play btn"
          onClick={() => onPreviewChange(true)}
          aria-label={`Play clip for ${scene.title}`}
        >
          ▶
        </button>
      ) : null}
      {overlays}
    </div>
  );
}
