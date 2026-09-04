import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import VideoPlayer from './video-player';
import { useVideoMiniPlayerStore } from '../../store/videoMiniPlayerStore';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';

export const GlobalVideoMiniPlayer: React.FC = () => {
  const navigate = useNavigate();
  const activeVideo = useVideoMiniPlayerStore((state) => state.activeVideo);
  const isFloating = useVideoMiniPlayerStore((state) => state.isFloating);
  const closeMiniPlayer = useVideoMiniPlayerStore((state) => state.closeMiniPlayer);
  const restoreToFull = useVideoMiniPlayerStore((state) => state.restoreToFull);
  const updatePlaybackState = useVideoMiniPlayerStore((state) => state.updatePlaybackState);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);

  const initialTime = useMemo(
    () => activeVideo?.currentTime ?? 0,
    // Capture initial start time when video item changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeVideo?.id, activeVideo?.src],
  );

  const handleRestore = useCallback(() => {
    if (!activeVideo) return;
    restoreToFull();
    if (activeVideo.id) {
      setTargetItemId(activeVideo.id);
    }
    if (activeVideo.originTab) {
      navigate(`/${activeVideo.originTab}`);
    } else {
      navigate('/videos');
    }
  }, [activeVideo, restoreToFull, setTargetItemId, navigate]);

  const handleToggleFloating = useCallback(
    (floating: boolean) => {
      if (!floating) {
        handleRestore();
      }
    },
    [handleRestore],
  );

  const handlePlaybackChange = useCallback(
    (state: Parameters<typeof updatePlaybackState>[0]) => {
      updatePlaybackState(state);
    },
    [updatePlaybackState],
  );

  if (!isFloating || !activeVideo) {
    return null;
  }

  return (
    <div data-testid="global-video-miniplayer" className="contents">
      <VideoPlayer
        src={activeVideo.src}
        itemId={activeVideo.id}
        title={activeVideo.title}
        mimeType={activeVideo.mimeType}
        aspectRatio={activeVideo.aspectRatio}
        autoPlay={activeVideo.isPlaying ?? true}
        initialTime={initialTime}
        isFloating={true}
        allowFloating={true}
        allowPiP={true}
        allowFullscreen={true}
        allowSpeedChange={true}
        allowDownload={activeVideo.allowDownload ?? true}
        onToggleFloating={handleToggleFloating}
        onClose={closeMiniPlayer}
        onPlaybackChange={handlePlaybackChange}
        className="shadow-2xl ring-1 ring-white/20 border border-white/15 rounded-2xl"
      />
    </div>
  );
};

export default GlobalVideoMiniPlayer;
