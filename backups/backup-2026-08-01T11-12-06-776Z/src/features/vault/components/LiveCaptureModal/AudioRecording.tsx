import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music } from 'lucide-react'
import { VoiceInput } from '../../../../components/ui/VoiceInput'
import { cn } from '../../../../lib/utils'
import { useMediaQuery } from '../../../../hooks/use-media-query'

interface AudioRecordingProps {
  isRecording: boolean
  recordingTime: number
  audioLevels: number[]
  onStart: () => void
  onStop: () => void
  recordingSize?: number
  isWaveformEnabled?: boolean
}

export const AudioRecording: React.FC<AudioRecordingProps> = ({
  isRecording,
  recordingTime,
  audioLevels,
  onStart,
  onStop,
  recordingSize = 0,
  isWaveformEnabled = true,
}) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const isTablet = useMediaQuery('(max-width: 1024px)')

  const barsData = React.useMemo(() => {
    const DEPTH_COUNT = isMobile ? 18 : isTablet ? 24 : 32
    const CORE_COUNT = isMobile ? 40 : isTablet ? 60 : 80
    const SVG_WIDTH = 1000

    return {
      depth: Array.from({ length: DEPTH_COUNT }).map((_, i) => {
        const width = isMobile ? 20 : 15
        const spacing = SVG_WIDTH / DEPTH_COUNT
        const offset = (spacing - width) / 2
        return {
          x: i * spacing + offset,
          width,
          height: 10,
          baseScale: 15 + Math.random() * 15,
          speed: 1.5 + Math.random() * 1,
          offset: i * 0.2
        }
      }),
      core: Array.from({ length: CORE_COUNT }).map((_, i) => {
        const width = isMobile ? 8 : 6
        const spacing = SVG_WIDTH / CORE_COUNT
        const offset = (spacing - width) / 2
        return {
          x: i * spacing + offset,
          width,
          height: 4,
          baseScale: 20 + Math.random() * 30,
          speed: 0.5 + Math.random() * 0.5,
          offset: i * 0.05
        }
      })
    }
  }, [isMobile, isTablet])

  const getAudioLevel = (index: number, total: number) => {
    if (!audioLevels || audioLevels.length === 0) return 0
    const levelIndex = Math.floor((index / total) * audioLevels.length)
    return (audioLevels[levelIndex] || 0) / 255
  }

  return (
    <div className="absolute inset-0 h-full w-full flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        {/* Backdrop Glow */}
        <div className={cn(
          "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] transition-opacity duration-1000",
          (isRecording && isWaveformEnabled) ? "opacity-100" : "opacity-0"
        )} />
        <svg className={cn("h-full w-full transition-opacity duration-1000", isWaveformEnabled ? "opacity-30" : "opacity-0")} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="voice-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="white" />
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
              animate={isRecording ? {
                scaleY: [1, bar.baseScale + getAudioLevel(i, 30) * 40, 1],
                opacity: [0.03, 0.1, 0.03],
              } : { scaleY: 0.1, opacity: 0 }}
              transition={{
                duration: bar.speed,
                repeat: Infinity,
                ease: "easeInOut",
                delay: bar.offset
              }}
              style={{ originY: "center", filter: "url(#wave-blur)" }}
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
              animate={isRecording ? {
                scaleY: Math.max(1, (getAudioLevel(i, 60) * 80) + (10 * Math.sin(Date.now() / 1000 + bar.offset))),
                opacity: isRecording ? 0.4 : 0,
              } : { scaleY: 0.1, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 0.5
              }}
              style={{ originY: "center" }}
            />
          ))}
        </svg>
      </div>

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 sm:gap-6 md:gap-8 p-4">
        <div className={cn(
          "relative flex items-center justify-center",
          "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40",
          "rounded-[32px] sm:rounded-[48px] md:rounded-[64px]",
          "transition-all duration-1000 backdrop-blur-3xl border",
          isRecording
            ? "bg-white/5 border-white/30 shadow-[0_0_80px_rgba(255,255,255,0.1)] scale-105 sm:scale-110 rotate-3"
            : "bg-white/[0.02] border-white/10 shadow-2xl rotate-0 hover:border-white/20"
        )}>

          <AnimatePresence>
            {isRecording && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={`pulse-${i}`}
                    className="absolute inset-0 border border-white/20 pointer-events-none rounded-[inherit]"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 0.15, 0], scale: [0.8, 1.3, 1.8] }}
                    transition={{ duration: 4, repeat: Infinity, delay: i * 1.3 }}
                  />
                ))}

                {/* Central Wave Visualization */}
                {/* <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-[3px] h-full w-full justify-center overflow-hidden rounded-[inherit]"
                  >
                    {Array.from({ length: 12 }).map((_, i) => (
                      <motion.div
                        key={`center-wave-${i}`}
                        className="w-[2px] bg-white/40 rounded-full"
                        animate={{
                          height: [4, (getAudioLevel(i, 12) * 48) + 4, 4],
                          opacity: [0.2, 0.5, 0.2]
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 260,
                          damping: 20,
                          mass: 0.5,
                        }}
                      />
                    ))}
                  </motion.div>
                </div> */}
              </>
            )}
          </AnimatePresence>

          <div className="absolute inset-0 flex items-center justify-center z-10">
            <motion.div
              animate={isRecording ? {
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              } : {}}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Music className={cn(
                "h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 transition-all duration-700",
                isRecording ? "text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]" : "text-white/10"
              )} />
            </motion.div>
          </div>
        </div>

        <div className="z-20 transform scale-100 sm:scale-110 md:scale-125">
          <VoiceInput
            isRecording={isRecording}
            time={recordingTime}
            onStart={onStart}
            onStop={onStop}
            audioLevels={audioLevels}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={isRecording ? "rec" : "idle"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center gap-2"
          >
            <p
              className={cn(
                "text-[9px] sm:text-[10px] md:text-xs font-black uppercase tracking-[0.4em] sm:tracking-[0.6em] transition-all duration-500 text-center px-4",
                isRecording
                  ? "text-white/80 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                  : "text-white/20 animate-pulse"
              )}
            >
              {isRecording ? "Transmitting Audio Data" : "Click to establish link"}
            </p>

            {isRecording && (
              <div className="flex items-center gap-4 text-[10px] sm:text-xs font-mono text-white/40">
                {/* <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />
                  {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                  {(recordingTime % 60).toString().padStart(2, '0')}
                </span> */}
                {/* <span className="w-px h-3 bg-white/10" /> */}
                <span>
                  {(recordingSize / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
