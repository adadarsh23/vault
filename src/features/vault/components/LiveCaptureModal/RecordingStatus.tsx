import React from 'react';
import { motion } from 'framer-motion';
import { Pause } from 'lucide-react';
import { cn } from '../../../../lib/utils';

import { TimelapseStats } from './types';

interface RecordingStatusProps {
  recordingTime: number;
  recordingSize: number;
  formatTime: (s: number) => string;
  formatSize: (b: number) => string;
  isPaused?: boolean;
  audioLevels?: number[];
  isTimelapse?: boolean;
  timelapseStats?: TimelapseStats;
}

export const RecordingStatus: React.FC<RecordingStatusProps> = ({
  recordingTime,
  recordingSize,
  formatTime,
  formatSize,
  isPaused = false,
  isTimelapse = false,
  timelapseStats,
}) => {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute left-1/2 -translate-x-1/2 top-2 sm:top-3 md:top-4 z-40 flex flex-col items-center gap-1 pointer-events-none"
    >
      <div
        className={cn(
          'flex items-center gap-1.5 md:gap-2.5 rounded-full px-2.5 sm:px-3.5 py-1 md:py-1.5 backdrop-blur-3xl border shadow-xl transition-all',
          isPaused
            ? 'bg-black/75 border-amber-500/30 ring-1 ring-amber-500/20 text-amber-300'
            : 'bg-black/75 border-red-500/30 ring-1 ring-red-500/20 text-white',
        )}
      >
        {/* Status Badge */}
        <div className="flex items-center gap-1.5">
          {isPaused ? (
            <>
              <Pause className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-400 fill-amber-400" />
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] text-amber-400">
                PAUSED
              </span>
            </>
          ) : isTimelapse ? (
            <>
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping shadow-[0_0_8px_rgba(251,191,36,1)]" />
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] text-amber-400">
                TIME-LAPSE {timelapseStats ? `${timelapseStats.speedMultiplier}X` : ''}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]" />
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] text-red-500">
                REC
              </span>
            </>
          )}
        </div>

        <div className="h-3 w-px bg-white/15" />

        {/* Elapsed Timer or Time-Lapse Output Duration */}
        {isTimelapse && timelapseStats ? (
          <div className="flex items-center gap-1.5 font-mono text-xs sm:text-sm font-black tracking-tight tabular-nums">
            <span className="text-white/60 text-[10px] font-sans font-bold uppercase">Real:</span>
            <span className="text-white">{formatTime(timelapseStats.realDurationSec)}</span>
            <span className="text-amber-400 font-bold mx-0.5">→</span>
            <span className="text-white/60 text-[10px] font-sans font-bold uppercase">Video:</span>
            <span className="text-amber-300 font-black">{timelapseStats.outputDurationSec}s</span>
            <span className="text-white/40 text-[9px]">({timelapseStats.framesCaptured}f)</span>
          </div>
        ) : (
          <span
            className={cn(
              'font-mono text-xs sm:text-sm font-black tracking-tight tabular-nums',
              isPaused ? 'text-amber-200/80 animate-pulse' : 'text-white',
            )}
          >
            {formatTime(recordingTime)}
          </span>
        )}

        {!isTimelapse && (
          <>
            <div className="h-3 w-px bg-white/15" />
            {/* Recording Data Size */}
            <span className="text-[8px] sm:text-[10px] font-mono text-white/70 font-bold tabular-nums">
              {formatSize(recordingSize)}
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
};
