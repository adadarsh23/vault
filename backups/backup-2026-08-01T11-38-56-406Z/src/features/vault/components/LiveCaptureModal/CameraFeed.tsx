import React from 'react'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { CaptureType } from './types'

interface CameraFeedProps {
  videoRef: any
  isInitializing: boolean
  cameraFacing: 'user' | 'environment'
  isHorizontallyFlipped: boolean
  captureRatio:
    | '1:1'
    | '4:5'
    | '3:4'
    | '4:3'
    | '2:3'
    | '3:2'
    | '9:16'
    | '16:9'
    | '21:9'
  type: CaptureType
  onFileSelect: (file: File) => void
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  videoRef,
  isInitializing,
  cameraFacing,
  isHorizontallyFlipped,
  captureRatio,
  type,
  onFileSelect,
}) => {
  const aspectRatioValue =
    captureRatio === '1:1'
      ? '1 / 1'
      : captureRatio === '4:5'
        ? '4 / 5'
        : captureRatio === '3:4'
          ? '3 / 4'
          : captureRatio === '4:3'
            ? '4 / 3'
            : captureRatio === '2:3'
              ? '2 / 3'
              : captureRatio === '3:2'
                ? '3 / 2'
                : captureRatio === '9:16'
                  ? '9 / 16'
                  : captureRatio === '21:9'
                    ? '21 / 9'
                    : '16 / 9'

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* Loading State Overlay */}
      {isInitializing && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black">
          <Loader2 className="h-8 w-8 md:h-12 md:w-12 animate-spin text-primary/40" />
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">
            Establishing Link...
          </p>
        </div>
      )}

      {/* Video Preview Container */}
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black p-2 sm:p-3 md:p-4">
        <div
          className={cn(
            'relative h-full w-auto max-w-full overflow-hidden rounded-xl border border-white/10 bg-black md:rounded-2xl',
          )}
          style={{ aspectRatio: aspectRatioValue }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              'absolute inset-0 h-full w-full object-contain transition-all duration-700',
              (cameraFacing === 'user') !== isHorizontallyFlipped &&
                'scale-x-[-1]',
              isInitializing
                ? 'opacity-0 scale-95 blur-xl'
                : 'opacity-100 scale-100 blur-0',
            )}
          />
        </div>
      </div>

      {/* Bottom controls are now consolidated in Actions.tsx to keep the feed row compact and centered. */}

      {/* Fallback for cases where camera is not available or blocked */}
      {(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) && (
        <div className="absolute inset-0 z-60 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur-3xl">
          <p className="mb-6 text-sm md:text-base font-bold text-white/40 uppercase tracking-widest leading-relaxed max-w-xs md:max-w-md">
            Hardware Interlink Unavailable or Access Denied
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-full bg-primary px-10 py-5 font-black text-black transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-primary/40">
            <Plus className="h-5 w-5" />
            EXTERNAL SOURCE UPLOAD
            <input
              type="file"
              accept={type === 'photo' ? 'image/*' : 'video/*'}
              capture={cameraFacing === 'user' ? 'user' : 'environment'}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  onFileSelect(file)
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
