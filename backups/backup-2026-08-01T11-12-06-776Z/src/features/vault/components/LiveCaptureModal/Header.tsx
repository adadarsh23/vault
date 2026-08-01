import React from 'react'
import { motion } from 'framer-motion'
import { Camera, Video, Mic, X, Loader2 } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
// Removed unused cn import
import { CaptureType } from './types'

interface HeaderProps {
  type: CaptureType
  isRecording: boolean
  capturedBlob: Blob | null
  isClosing: boolean
  onClose: () => void
}

export const Header: React.FC<HeaderProps> = ({
  type,
  isRecording,
  capturedBlob,
  isClosing,
  onClose,
}) => {
  const headingLabel =
    type === 'photo' ? 'Photo' : type === 'video' ? 'Video' : 'Audio'

  return (
    <div className="z-10 flex items-center justify-between p-1.5 px-4 md:p-4 bg-white/[0.03] border-b border-white/10 backdrop-blur-3xl shadow-lg">
      <div className="flex items-center gap-2 md:gap-4">
        <div className="flex h-7 w-7 md:h-10 md:w-10 items-center justify-center rounded-lg md:rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
          {type === 'photo' && <Camera className="h-3.5 w-3.5 md:h-5 md:w-5" />}
          {type === 'video' && <Video className="h-3.5 w-3.5 md:h-5 md:w-5" />}
          {type === 'audio' && <Mic className="h-3.5 w-3.5 md:h-5 md:w-5" />}
        </div>
        <div>
          <h3 className="text-sm sm:text-base md:text-lg font-black text-white tracking-wide md:tracking-tight flex items-center gap-1.5">
            {headingLabel}
            {isRecording && (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
              />
            )}
          </h3>
          <p className="hidden md:block text-xs font-semibold text-white/30 tracking-wide uppercase mt-0.5">
            {capturedBlob ? 'Quality Assurance Review' : `Military-Grade Secure ${headingLabel} session`}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        disabled={isClosing}
        className="h-8 w-8 md:h-10 md:w-10 rounded-full text-white/40 hover:bg-white/10 hover:text-white transition-all duration-300"
      >
        {isClosing ? (
          <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
        ) : (
          <X className="h-4 w-4 md:h-5 md:w-5" />
        )}
      </Button>
    </div>
  )
}
