import React from 'react';
import { motion } from 'framer-motion';
import {
  PictureInPicture2,
  ArrowLeftRight,
  Columns,
  Rows,
  Maximize2,
  Move,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { DualCameraLayout, PipPosition } from './types';
import { triggerHaptic } from './haptics';

interface DualCameraOverlayProps {
  enabled: boolean;
  secondaryVideoRef: React.RefObject<HTMLVideoElement | null>;
  layout: DualCameraLayout;
  pipPosition: PipPosition;
  isSwapped: boolean;
  onToggleLayout: () => void;
  onCyclePipPosition: () => void;
  onSwapCameras: () => void;
  primaryFacing: 'user' | 'environment';
}

export const DualCameraOverlay: React.FC<DualCameraOverlayProps> = ({
  enabled,
  secondaryVideoRef,
  layout,
  pipPosition,
  isSwapped,
  onToggleLayout,
  onCyclePipPosition,
  onSwapCameras,
  primaryFacing,
}) => {
  if (!enabled) return null;

  const isMainFront = isSwapped ? primaryFacing !== 'user' : primaryFacing === 'user';
  const isSubFront = !isMainFront;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {/* PiP Bubble View */}
      {layout === 'pip' && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic('light');
            onCyclePipPosition();
          }}
          className={cn(
            'pointer-events-auto absolute transition-all duration-300 ease-out cursor-pointer group shadow-2xl rounded-2xl overflow-hidden border-2 border-white/60 bg-black/80 backdrop-blur-md',
            'w-[30%] max-w-[150px] aspect-4/3 sm:aspect-video',
            pipPosition === 'top-right' && 'top-3 right-3',
            pipPosition === 'top-left' && 'top-3 left-3',
            pipPosition === 'bottom-right' && 'bottom-16 right-3',
            pipPosition === 'bottom-left' && 'bottom-16 left-3'
          )}
        >
          {/* Secondary Video Feed */}
          <video
            ref={secondaryVideoRef as any}
            autoPlay
            playsInline
            muted
            className={cn(
              'w-full h-full object-cover pointer-events-none',
              isSubFront && 'scale-x-[-1]'
            )}
          />

          {/* Quick Corner Reposition & Swap Indicator */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 pointer-events-none">
            <Move className="h-4 w-4 text-white drop-shadow-md" />
            <span className="text-[9px] font-black text-white uppercase tracking-wider">Tap Move</span>
          </div>

          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[8px] font-black text-white/80 uppercase">
            {isSubFront ? 'Front' : 'Back'}
          </div>
        </div>
      )}

      {/* Floating Dual Camera Mode Toolbar */}
      <div className="pointer-events-auto absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-full bg-black/75 p-1 backdrop-blur-2xl border border-white/15 shadow-xl">
        {/* Swap Primary / Secondary */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onSwapCameras();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white transition-all active:scale-90"
          title="Swap Main & PiP Cameras"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>

        {/* Layout Switcher (PiP -> Side-by-Side Split -> Top-Bottom Split) */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onToggleLayout();
          }}
          className="flex h-7 px-2 items-center gap-1 rounded-full bg-primary/20 text-primary border border-primary/30 text-[10px] font-black uppercase tracking-wider hover:bg-primary/30 active:scale-95 transition-all"
          title="Switch Dual Layout"
        >
          {layout === 'pip' && <PictureInPicture2 className="h-3 w-3" />}
          {layout === 'split-horizontal' && <Columns className="h-3 w-3" />}
          {layout === 'split-vertical' && <Rows className="h-3 w-3" />}
          <span>{layout === 'pip' ? 'PiP' : layout === 'split-horizontal' ? 'Split H' : 'Split V'}</span>
        </button>
      </div>
    </div>
  );
};
