import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Maximize2, Minimize2, Music, Edit3, MessageSquareText, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import VideoPlayer from '../../../../components/ui/video-player';
import { AudioPlayer } from '../../../../components/ui/audio-player';
import { useVaultStore } from '../../../../store/vaultStore';
import { Button } from '../../../../components/ui/Button';
import { CaptureType } from './types';
import { PhotoEditor } from './PhotoEditor';
import { VideoEditor } from './VideoEditor';
import { VoiceClarityPreset } from '../../../../lib/audioDsp';

const MemoVideoPlayer = React.memo(VideoPlayer);

interface PreviewContentProps {
  type: CaptureType;
  previewUrl: string;
  capturedBlob?: Blob | null;
  transcript?: string;
  voiceClarityPreset?: VoiceClarityPreset;
  duration?: number;
  onUpdateBlob?: (blob: Blob, url: string) => void;
}

export const PreviewContent: React.FC<PreviewContentProps> = ({
  type,
  previewUrl,
  capturedBlob,
  transcript,
  voiceClarityPreset,
  duration,
  onUpdateBlob,
}) => {
  const previewRootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [isEditingVideo, setIsEditingVideo] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

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

  // If user is in Photo Editor mode
  if (type === 'photo' && isEditingPhoto && capturedBlob && onUpdateBlob) {
    return (
      <PhotoEditor
        initialBlob={capturedBlob}
        initialUrl={previewUrl}
        onSave={(editedBlob, editedUrl) => {
          onUpdateBlob(editedBlob, editedUrl);
          setIsEditingPhoto(false);
        }}
        onCancel={() => setIsEditingPhoto(false)}
      />
    );
  }

  // If user is in Video Editor mode
  if (type === 'video' && isEditingVideo && capturedBlob && onUpdateBlob) {
    return (
      <VideoEditor
        initialBlob={capturedBlob}
        initialUrl={previewUrl}
        onSave={(editedBlob, editedUrl) => {
          onUpdateBlob(editedBlob, editedUrl);
          setIsEditingVideo(false);
        }}
        onCancel={() => setIsEditingVideo(false)}
      />
    );
  }

  return (
    <motion.div
      ref={previewRootRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative z-20 flex h-full w-full items-center justify-center p-1 overflow-hidden"
    >
      {/* Top Floating Controls */}
      <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
        {type === 'photo' && capturedBlob && onUpdateBlob && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsEditingPhoto(true)}
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/60 text-white/90 border border-white/15 hover:bg-black/80 hover:text-white backdrop-blur-md shadow-lg active:scale-95"
            title="Edit & Redact Photo"
            aria-label="Edit and redact photo"
          >
            <Edit3 className="h-4 w-4 text-primary" />
          </Button>
        )}

        {type === 'video' && capturedBlob && onUpdateBlob && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsEditingVideo(true)}
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/60 text-white/90 border border-white/15 hover:bg-black/80 hover:text-white backdrop-blur-md shadow-lg active:scale-95"
            title="Edit & Filter Video"
            aria-label="Edit and filter video"
          >
            <Edit3 className="h-4 w-4 text-primary" />
          </Button>
        )}

        {type === 'photo' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void toggleFullscreen()}
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/60 text-white/80 border border-white/15 hover:bg-black/80 hover:text-white backdrop-blur-md shadow-lg active:scale-95"
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* PHOTO */}
      {type === 'photo' && (
        <div className="w-full h-full flex items-center justify-center bg-black p-2">
          <img
            src={previewUrl}
            alt="Captured"
            className="h-full w-full object-contain rounded-lg"
          />
        </div>
      )}

      {/* VIDEO */}
      {type === 'video' && (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <MemoVideoPlayer
            key={previewUrl}
            src={previewUrl}
            className="max-w-full max-h-full flex items-center justify-center"
            autoPlay={true}
          />
        </div>
      )}

      {/* AUDIO */}
      {type === 'audio' && (
        <div className="w-full max-w-lg max-h-full overflow-y-auto custom-scrollbar flex flex-col items-center justify-center gap-3 sm:gap-5 p-2 sm:p-5 md:p-6">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl sm:rounded-3xl bg-primary/10 text-primary border border-primary/20 shadow-[0_0_30px_rgba(0,242,254,0.15)]">
              <Music className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10" />
            </div>
            <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase mt-0.5">
              Recorded Audio Preview
            </span>
          </div>

          <AudioPlayer
            src={previewUrl}
            title="Recorded Audio"
            initialVoiceClarityPreset={voiceClarityPreset}
            initialDuration={duration}
            isWaveformEnabled={isAudioWaveformEnabled}
            autoPlay={true}
            className="w-full max-w-none border border-white/10 bg-black/50 backdrop-blur-2xl p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-2xl"
          />

          {transcript && (
            <div className="w-full rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-3 sm:p-4 backdrop-blur-md shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300 min-w-0">
                  <MessageSquareText className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Recorded Speech Transcript</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard
                        .writeText(transcript)
                        .then(() => {
                          setCopiedTranscript(true);
                          toast.success('Transcript copied to clipboard');
                          setTimeout(() => setCopiedTranscript(false), 2000);
                        })
                        .catch(() => {
                          toast.error('Failed to copy');
                        });
                    }
                  }}
                  className="h-7 px-2 text-xs text-cyan-300 hover:bg-cyan-500/20 shrink-0"
                >
                  {copiedTranscript ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-white/85 whitespace-pre-wrap select-text max-h-28 sm:max-h-36 overflow-y-auto custom-scrollbar leading-relaxed font-sans border-l border-cyan-500/30 pl-2">
                {transcript}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
