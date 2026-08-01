import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Maximize2, Minimize2, Music } from 'lucide-react';
import VideoPlayer from '../../../../components/ui/video-player';
import { AudioPlayer } from '../../../../components/ui/audio-player';
import { useVaultStore } from '../../../../store/vaultStore';
import { Button } from '../../../../components/ui/Button';
import { CaptureType } from './types';

const MemoVideoPlayer = React.memo(VideoPlayer);

interface PreviewContentProps {
  type: CaptureType;
  previewUrl: string;
}

export const PreviewContent: React.FC<PreviewContentProps> = ({ type, previewUrl }) => {
  const previewRootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isAudioWaveformEnabled = useVaultStore((state) => state.preferences.isAudioWaveformEnabled);

  const toggleFullscreen = useCallback(async () => {
    const element = previewRootRef.current;
    if (!element) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    await element.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <motion.div
      ref={previewRootRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative z-20 flex h-full w-full items-center justify-center p-1 overflow-hidden"
    >
      {(type === 'photo' || type === 'video') && (
        <div className="absolute right-3 top-3 z-40">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void toggleFullscreen()}
            className="h-10 w-10 rounded-full bg-black/40 text-white/80 border border-white/15 hover:bg-black/60 hover:text-white"
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* PHOTO */}
      {type === 'photo' && (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <img src={previewUrl} alt="Captured" className="h-full w-full object-contain" />
        </div>
      )}

      {/* VIDEO */}
      {type === 'video' && (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <MemoVideoPlayer
            key={previewUrl}
            src={previewUrl}
            className="w-full h-full"
            autoPlay={true}
          />
        </div>
      )}

      {/* AUDIO */}
      {type === 'audio' && (
        <div
          className="w-full max-w-lg
          flex flex-col items-center justify-center 
          gap-10 p-8 sm:p-12
        "
        >
          <div
            className="
            flex h-24 w-24 sm:h-32 sm:w-32 
            items-center justify-center 
            rounded-full 
            bg-primary/10 
            text-primary 
            border border-primary/20 
            shadow-[0_0_30px_rgba(0,242,254,0.1)]
          "
          >
            <Music className="h-12 w-12 sm:h-16 sm:w-16" />
          </div>

          <AudioPlayer
            src={previewUrl}
            isWaveformEnabled={isAudioWaveformEnabled}
            className="w-full max-w-none border-none shadow-none bg-transparent backdrop-blur-none p-0"
          />
        </div>
      )}
    </motion.div>
  );
};
