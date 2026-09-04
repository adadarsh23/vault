import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'photo' | 'video' | 'audio';
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, type }) => {
  const shortcuts = [
    {
      key: 'Space / Enter',
      description:
        type === 'photo'
          ? 'Take Photo'
          : type === 'video'
            ? 'Start / Stop Video Recording'
            : 'Start / Stop Audio Recording',
    },
    ...(type === 'video'
      ? [
          {
            key: 'P',
            description: 'Pause / Resume Recording',
          },
        ]
      : []),
    ...(type !== 'audio'
      ? [
          {
            key: 'C',
            description: 'Switch Front / Back Camera',
          },
          {
            key: 'F',
            description: 'Horizontal Flip / Mirror',
          },
          {
            key: 'G',
            description: 'Toggle 3x3 Framing Grid',
          },
          {
            key: 'T',
            description: 'Cycle Timer (Off → 3s → 5s → 10s)',
          },
          {
            key: 'H',
            description: 'Toggle Gyroscopic Horizon Leveler',
          },
          {
            key: 'Q',
            description: 'Toggle QR / Barcode Scanner',
          },
          {
            key: 'D',
            description: 'Toggle Dual Camera Mode (PiP)',
          },
        ]
      : []),
    ...(type === 'video'
      ? [
          {
            key: 'L',
            description: 'Toggle Time-Lapse Recording Mode',
          },
          {
            key: 'M',
            description: 'Mute / Unmute Microphone',
          },
        ]
      : []),
    {
      key: 'Esc',
      description: 'Close Live Capture',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur-2xl text-white"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm md:text-base tracking-wide">Keyboard Shortcuts</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {shortcuts.map((sc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  <span className="text-xs text-white/70">{sc.description}</span>
                  <kbd className="px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono font-bold text-primary">
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={onClose}
                className="rounded-xl px-5 text-xs font-bold"
              >
                Got It
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
