import React, { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, MessageSquareText, Sparkles, Subtitles, Globe } from 'lucide-react';
import { VoiceInput } from '../../../../components/ui/VoiceInput';
import { cn } from '../../../../lib/utils';
import { useMediaQuery } from '../../../../hooks/use-media-query';

interface AudioRecordingProps {
  isRecording: boolean;
  recordingTime: number;
  audioLevels: number[];
  onStart: () => void;
  onStop: () => void;
  recordingSize?: number;
  isWaveformEnabled?: boolean;
  voiceClarityPreset?: string;
  liveTranscript?: string;
  isTranscribing?: boolean;
  transcriptLang?: 'en-IN' | 'hi-IN';
  onToggleTranscribe?: () => void;
  onCycleVoiceClarity?: () => void;
  onSwitchLanguage?: (lang: 'en-IN' | 'hi-IN') => void;
}

export const AudioRecording: React.FC<AudioRecordingProps> = ({
  isRecording,
  recordingTime,
  audioLevels,
  onStart,
  onStop,
  recordingSize = 0,
  isWaveformEnabled = true,
  voiceClarityPreset = 'crystal',
  liveTranscript = '',
  isTranscribing = false,
  transcriptLang = 'en-IN',
  onToggleTranscribe,
  onCycleVoiceClarity,
  onSwitchLanguage,
}) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript container as speech stream advances forward
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  const barsData = useMemo(() => {
    const DEPTH_COUNT = isMobile ? 16 : isTablet ? 24 : 32;
    const CORE_COUNT = isMobile ? 36 : isTablet ? 54 : 72;
    const SVG_WIDTH = 1000;

    return {
      depth: Array.from({ length: DEPTH_COUNT }).map((_, i) => {
        const width = isMobile ? 18 : 14;
        const spacing = SVG_WIDTH / DEPTH_COUNT;
        const offset = (spacing - width) / 2;
        return {
          x: i * spacing + offset,
          width,
          height: 10,
          baseScale: 15 + Math.random() * 15,
          speed: 1.5 + Math.random() * 1,
          offset: i * 0.2,
        };
      }),
      core: Array.from({ length: CORE_COUNT }).map((_, i) => {
        const width = isMobile ? 7 : 5;
        const spacing = SVG_WIDTH / CORE_COUNT;
        const offset = (spacing - width) / 2;
        return {
          x: i * spacing + offset,
          width,
          height: 4,
          baseScale: 20 + Math.random() * 30,
          speed: 0.5 + Math.random() * 0.5,
          offset: i * 0.05,
        };
      }),
    };
  }, [isMobile, isTablet]);

  const getAudioLevel = (index: number, total: number) => {
    if (!audioLevels || audioLevels.length === 0) return 0;
    const levelIndex = Math.floor((index / total) * audioLevels.length);
    return (audioLevels[levelIndex] || 0) / 255;
  };

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-between overflow-y-auto custom-scrollbar p-3 sm:p-6 md:p-8 select-none">
      {/* Background Audio Waveform Canvas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div
          className={cn(
            'absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,254,0.08)_0%,transparent_70%)] transition-opacity duration-1000',
            isRecording && isWaveformEnabled ? 'opacity-100' : 'opacity-0',
          )}
        />
        <svg
          className={cn(
            'h-full w-full transition-opacity duration-1000',
            isWaveformEnabled ? 'opacity-30' : 'opacity-0',
          )}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="voice-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="rgba(0,242,254,0.8)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <filter id="wave-blur">
              <feGaussianBlur stdDeviation="6" result="blur" />
            </filter>
          </defs>

          {barsData.depth.map((bar, i) => (
            <motion.rect
              key={`wave-depth-${i}`}
              x={bar.x}
              y={500 - bar.height / 2}
              width={bar.width}
              height={bar.height}
              rx={bar.width / 2}
              fill="white"
              initial={{ scaleY: 0.1, opacity: 0 }}
              animate={
                isRecording
                  ? {
                      scaleY: [1, bar.baseScale + getAudioLevel(i, 30) * 40, 1],
                      opacity: [0.03, 0.1, 0.03],
                    }
                  : { scaleY: 0.1, opacity: 0 }
              }
              transition={{
                duration: bar.speed,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: bar.offset,
              }}
              style={{ originY: 'center', filter: 'url(#wave-blur)' }}
            />
          ))}
          {barsData.core.map((bar, i) => (
            <motion.rect
              key={`wave-core-${i}`}
              x={bar.x}
              y={500 - bar.height / 2}
              width={bar.width}
              height={bar.height}
              rx={bar.width / 2}
              fill="url(#voice-grad)"
              initial={{ scaleY: 0.1, opacity: 0 }}
              animate={
                isRecording
                  ? {
                      scaleY: Math.max(
                        1,
                        getAudioLevel(i, 60) * 80 + 10 * Math.sin(Date.now() / 1000 + bar.offset),
                      ),
                      opacity: isRecording ? 0.5 : 0,
                    }
                  : { scaleY: 0.1, opacity: 0 }
              }
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 30,
                mass: 0.5,
              }}
              style={{ originY: 'center' }}
            />
          ))}
        </svg>
      </div>

      {/* TOP CONTROLS: STATS, DSP PRESET & TRANSCRIPT PILL */}
      <div className="relative z-10 w-full max-w-lg flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* DSP Voice Clarity Pill */}
        {voiceClarityPreset && voiceClarityPreset !== 'off' ? (
          <button
            type="button"
            onClick={onCycleVoiceClarity}
            title="Click to cycle Voice Clarity filter preset (Crystal -> Gate -> Warm -> Off)"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[32px] sm:min-h-[36px] rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[11px] font-semibold backdrop-blur-md shadow-[0_0_12px_rgba(6,182,212,0.2)] hover:bg-cyan-500/25 active:scale-95 transition-all"
          >
            <span className="relative flex h-2 w-2 mr-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <Sparkles className="h-3 w-3 text-cyan-400 shrink-0" />
            <span>
              DSP:{' '}
              {voiceClarityPreset === 'crystal'
                ? 'CRYSTAL'
                : voiceClarityPreset === 'aggressive'
                  ? 'NOISE GATE'
                  : voiceClarityPreset === 'warm-interview'
                    ? 'WARM PODCAST'
                    : String(voiceClarityPreset).toUpperCase()}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onCycleVoiceClarity}
            title="Enable Voice Clarity DSP filter"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[32px] sm:min-h-[36px] rounded-full bg-white/5 border border-white/10 text-white/60 text-[11px] font-medium hover:bg-white/10 hover:text-white active:scale-95 transition-all"
          >
            <Sparkles className="h-3 w-3 opacity-60 shrink-0" />
            <span>DSP: Off</span>
          </button>
        )}

        {/* Live Status & Language Switcher */}
        <div className="flex items-center gap-1.5">
          {isRecording && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] sm:min-h-[36px] rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-mono shrink-0 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>{(recordingSize / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
          )}

          {/* Quick Language Toggle Pill */}
          {onSwitchLanguage && isTranscribing && (
            <button
              type="button"
              onClick={() => onSwitchLanguage(transcriptLang === 'en-IN' ? 'hi-IN' : 'en-IN')}
              title={`Speech Language: ${transcriptLang === 'hi-IN' ? 'हिन्दी (Hindi)' : 'English / Hinglish'}. Tap to switch.`}
              className="flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] sm:min-h-[36px] rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold backdrop-blur-md hover:bg-emerald-500/25 active:scale-95 transition-all shrink-0"
            >
              <Globe className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>{transcriptLang === 'hi-IN' ? 'HI (हिन्दी)' : 'EN (English)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* CENTER: RESPONSIVE RECORDING CORE & MIC BUTTON */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto py-2 sm:py-4 gap-3 sm:gap-5 md:gap-6 w-full max-w-sm">
        {/* Animated Sound Glow Box */}
        <div
          className={cn(
            'relative flex items-center justify-center',
            'h-20 w-20 sm:h-28 sm:w-28 md:h-36 md:w-36',
            'rounded-[28px] sm:rounded-[40px] md:rounded-[56px]',
            'transition-all duration-700 backdrop-blur-3xl border shrink-0',
            isRecording
              ? 'bg-cyan-500/10 border-cyan-400/40 shadow-[0_0_80px_rgba(0,242,254,0.2)] scale-105 rotate-2'
              : 'bg-white/[0.03] border-white/10 shadow-2xl rotate-0 hover:border-white/20',
          )}
        >
          <AnimatePresence>
            {isRecording && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={`pulse-${i}`}
                    className="absolute inset-0 border border-cyan-400/20 pointer-events-none rounded-[inherit]"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 0.2, 0], scale: [0.8, 1.3, 1.8] }}
                    transition={{ duration: 3.5, repeat: Infinity, delay: i * 1.1 }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          <div className="absolute inset-0 flex items-center justify-center z-10">
            <motion.div
              animate={
                isRecording
                  ? {
                      scale: [1, 1.12, 1],
                      rotate: [0, 4, -4, 0],
                    }
                  : {}
              }
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              <Music
                className={cn(
                  'h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 transition-all duration-500',
                  isRecording
                    ? 'text-cyan-300 drop-shadow-[0_0_20px_rgba(0,242,254,0.6)]'
                    : 'text-white/20',
                )}
              />
            </motion.div>
          </div>
        </div>

        {/* Central Voice Input Trigger Button */}
        <div className="z-20 transform scale-95 sm:scale-105 md:scale-115 shrink-0">
          <VoiceInput
            isRecording={isRecording}
            time={recordingTime}
            onStart={onStart}
            onStop={onStop}
            audioLevels={audioLevels}
          />
        </div>

        {/* Recording Subtitle / Hint */}
        <p
          className={cn(
            'text-[9px] sm:text-[10px] md:text-xs font-black uppercase tracking-[0.3em] sm:tracking-[0.5em] transition-all duration-500 text-center px-2',
            isRecording
              ? 'text-cyan-300 drop-shadow-[0_0_10px_rgba(0,242,254,0.4)]'
              : 'text-white/30 animate-pulse',
          )}
        >
          {isRecording ? 'Transmitting Encrypted Audio' : 'Click Mic to Record'}
        </p>
      </div>

      {/* BOTTOM: LIVE SPEECH TRANSCRIPTION STREAM (CONTINUOUS & AUTO-SCROLLING) */}
      <div className="relative z-10 w-full max-w-lg shrink-0 mt-2">
        <AnimatePresence mode="wait">
          {isTranscribing ? (
            <motion.div
              key="transcript-box"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="w-full rounded-2xl bg-black/80 border border-emerald-500/25 p-3 sm:p-4 backdrop-blur-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold min-w-0">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <Subtitles className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate">
                    Live Transcript Stream
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onSwitchLanguage && (
                    <button
                      type="button"
                      onClick={() =>
                        onSwitchLanguage(transcriptLang === 'en-IN' ? 'hi-IN' : 'en-IN')
                      }
                      title="Switch speech recognition language"
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition-colors"
                    >
                      {transcriptLang === 'hi-IN' ? 'हिन्दी' : 'English'}
                    </button>
                  )}
                  {onToggleTranscribe && (
                    <button
                      type="button"
                      onClick={onToggleTranscribe}
                      title="Turn off speech-to-text transcription"
                      className="text-[10px] text-white/40 hover:text-white/80 px-1.5 py-0.5 rounded transition-colors"
                    >
                      Turn Off
                    </button>
                  )}
                </div>
              </div>

              {/* Streaming Content: Auto-scrolling, never cut off, continuously updates */}
              <div
                ref={transcriptScrollRef}
                className="max-h-20 sm:max-h-28 overflow-y-auto custom-scrollbar pr-1 select-text scroll-smooth"
              >
                {liveTranscript ? (
                  <p className="text-xs sm:text-sm text-white/95 leading-relaxed font-sans whitespace-pre-wrap break-words">
                    {liveTranscript}
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                  </p>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-white/40 text-xs italic">
                    <MessageSquareText className="h-3.5 w-3.5 animate-pulse text-emerald-400/60" />
                    <span>
                      Listening... Speak into microphone in{' '}
                      {transcriptLang === 'hi-IN' ? 'Hindi' : 'English'}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="transcript-prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center"
            >
              {onToggleTranscribe && (
                <button
                  type="button"
                  onClick={onToggleTranscribe}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/60 hover:text-white text-[11px] font-medium backdrop-blur-xl transition-all shadow-sm active:scale-95"
                >
                  <Subtitles className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Turn on Live Speech-to-Text (EN / HI)</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
