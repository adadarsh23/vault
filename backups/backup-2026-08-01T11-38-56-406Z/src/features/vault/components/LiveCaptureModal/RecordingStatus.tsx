import React from 'react'
import { motion } from 'framer-motion'

interface RecordingStatusProps {
  recordingTime: number
  recordingSize: number
  formatTime: (s: number) => string
  formatSize: (b: number) => string
}

export const RecordingStatus: React.FC<RecordingStatusProps> = ({
  recordingTime,
  recordingSize,
  formatTime,
  formatSize,
}) => {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute left-1/2 -translate-x-1/2 top-2 md:top-4 z-40 flex flex-col items-center gap-1"
    >
      <div className="flex items-center gap-1 md:gap-2 rounded-lg bg-black/60 px-2 md:px-3 py-1 md:py-1.5 backdrop-blur-3xl border border-red-500/20 shadow-lg ring-1 ring-red-500/10">
        <div className="flex items-center gap-1">
          <span className="flex h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,1)]" />
          <span className="hidden md:inline text-[7px] md:text-[9px] font-black uppercase tracking-[0.15em] text-red-500">
            REC
          </span>
        </div>
        <div className="hidden md:block h-2.5 w-px bg-white/10" />
        <span className="font-mono text-xs md:text-sm text-white font-black tracking-tighter tabular-nums">
          {formatTime(recordingTime)}
        </span>
        <div className="h-2.5 w-px bg-white/10" />
        <span className="text-[6px] md:text-[8px] font-mono text-white/40 font-bold tabular-nums">
          {formatSize(recordingSize)}
        </span>
      </div>
    </motion.div>
  )
}
