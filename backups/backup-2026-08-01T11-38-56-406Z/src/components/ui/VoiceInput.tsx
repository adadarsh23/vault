"use client"

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Mic } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface VoiceInputProps extends React.ComponentProps<"div"> {
  onStart?: () => void
  onStop?: () => void
  isRecording?: boolean
  time?: number
  audioLevels?: number[]
}

export const VoiceInput = memo(function VoiceInput({
  className,
  onStart,
  onStop,
  isRecording: externalIsRecording,
  time: externalTime,
  audioLevels,
  ...props
}: VoiceInputProps) {
  const [internalListening, setInternalListening] = useState(false)
  const [internalTime, setInternalTime] = useState(0)
  const [ticker, setTicker] = useState(0)
  const tickRef = useRef(0)

  const startTimeRef = useRef<number>(Date.now())
  const prevListeningRef = useRef(false)
  const noiseRef = useRef(Array.from({ length: 12 }, () => Math.random()))

  const isListening = externalIsRecording ?? internalListening
  const displayTime = externalTime ?? internalTime

  useEffect(() => {
    if (externalIsRecording !== undefined) {
      setInternalListening(externalIsRecording)
    }
  }, [externalIsRecording])

  useEffect(() => {
    if (prevListeningRef.current && !isListening) {
      setInternalTime(0)
      startTimeRef.current = Date.now()
    }
    prevListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    if (isListening && externalTime === undefined) {
      startTimeRef.current = Date.now()

      interval = setInterval(() => {
        setInternalTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isListening, externalTime])

  useEffect(() => {
    if (!isListening) return

    let rafId: number
    const loop = () => {
      tickRef.current = Date.now()
      setTicker(prev => prev + 1)
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(rafId)
  }, [isListening])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const onClickHandler = useCallback(() => {
    if (isListening) onStop?.()
    else onStart?.()

    if (externalIsRecording === undefined) {
      setInternalListening(prev => !prev)
    }
  }, [isListening, onStop, onStart, externalIsRecording])

  // Professional reordering for "center-bulge" effect if we have real frequency data
  const levels = useMemo(() => {
    if (audioLevels && audioLevels.length > 0) {
      const order = [11, 9, 7, 5, 3, 1, 0, 2, 4, 6, 8, 10]
      return order.map(idx => audioLevels?.[idx] ?? 0)
    }

    // Organic synthetic fallback
    return Array.from({ length: 12 }, (_, i) => {
      const t = tickRef.current / 400
      const centerDist = Math.abs(i - 5.5) / 6

      // Multi-layer wave for organic motion
      const wave = Math.sin(t - i * 0.6) * 0.5 +
        Math.sin(t * 1.2 + i * 0.4) * 0.2 +
        (noiseRef.current[i] - 0.5) * 0.15

      // Dynamic intensity that allows for higher peaks
      const intensity = (1.2 - centerDist * 0.6)
      const boosted = ((wave + 1) / 2) * intensity

      return Math.max(10, Math.floor(boosted * 100))
    })
  }, [audioLevels, ticker, isListening])

  return (
    <div
      className={cn("flex flex-col items-center justify-center", className)}
      {...props}
    >
      <motion.div
        className="flex items-center gap-2 p-2 rounded-full cursor-pointer bg-black/40 backdrop-blur-md border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        layout
        onClick={onClickHandler}
        role="button"
        aria-pressed={isListening}
        aria-label={isListening ? "Stop recording" : "Start recording"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClickHandler()
          }
        }}
        transition={{ layout: { duration: 0.35, ease: "easeInOut" } }}
      >
        <div className="h-6 w-6 flex items-center justify-center">
          {isListening ? (
            <motion.div
              className="w-4 h-4 bg-primary rounded-sm"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ) : (
            <Mic className="h-4 w-4 text-white/70" />
          )}
        </div>

        <AnimatePresence mode="wait">
          {isListening && (
            <motion.div
              initial={{ opacity: 0, maxWidth: 0 }}
              animate={{ opacity: 1, maxWidth: 200 }}
              exit={{ opacity: 0, maxWidth: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              {/* Audio bars */}
              <div className="flex items-center gap-[3px] h-5 px-1">
                {levels.map((level, i) => {
                  const clamp = (v: number) => Math.min(1, Math.max(0, v))
                  const isRealAudio = audioLevels && audioLevels.length > 0
                  const normalizedLevel = isRealAudio
                    ? clamp(level / 255)
                    : clamp(level / 100)

                  return (
                    <motion.div
                      key={`bar-${i}`}
                      className="w-[2.5px] bg-primary rounded-full"
                      style={{
                        height: "100%",
                        originY: 0.5
                      }}
                      animate={{
                        scaleY: isListening ? Math.max(normalizedLevel, 0.15) : 0.15,
                        opacity: isListening ? 1 : 0.4,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                        mass: 0.5,
                      }}
                    />
                  )
                })}
              </div>

              {/* Timer */}
              <div className="text-[10px] font-mono text-white/60 w-10 text-center">
                {formatTime(displayTime)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
})