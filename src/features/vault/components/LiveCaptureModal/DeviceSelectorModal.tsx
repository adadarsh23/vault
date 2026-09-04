import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Mic, X, Check, Laptop } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { MediaDeviceInfoItem } from './types';

interface DeviceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoDevices: MediaDeviceInfoItem[];
  audioDevices: MediaDeviceInfoItem[];
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
  onSelectVideoDevice: (deviceId: string) => void;
  onSelectAudioDevice: (deviceId: string) => void;
  type: 'photo' | 'video' | 'audio';
}

export const DeviceSelectorModal: React.FC<DeviceSelectorModalProps> = ({
  isOpen,
  onClose,
  videoDevices,
  audioDevices,
  selectedVideoDeviceId,
  selectedAudioDeviceId,
  onSelectVideoDevice,
  onSelectAudioDevice,
  type,
}) => {
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
                <Laptop className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm md:text-base tracking-wide">
                  Device Hardware Selector
                </h3>
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

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Cameras */}
              {type !== 'audio' && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    <span>Camera Devices ({videoDevices.length})</span>
                  </div>
                  {videoDevices.length === 0 ? (
                    <p className="text-xs text-white/40 italic p-2 rounded-lg bg-white/[0.02]">
                      No video input devices found or permission not granted.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {videoDevices.map((dev, idx) => {
                        const isSelected =
                          selectedVideoDeviceId === dev.deviceId ||
                          (!selectedVideoDeviceId && idx === 0);
                        return (
                          <button
                            key={dev.deviceId || `cam-${idx}`}
                            type="button"
                            onClick={() => onSelectVideoDevice(dev.deviceId)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                              isSelected
                                ? 'border-primary/40 bg-primary/15 text-white'
                                : 'border-white/5 bg-white/[0.03] text-white/70 hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className="truncate pr-2">
                              {dev.label || `Camera ${idx + 1}`}
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Microphones */}
              {type !== 'photo' && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                    <Mic className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Microphone Devices ({audioDevices.length})</span>
                  </div>
                  {audioDevices.length === 0 ? (
                    <p className="text-xs text-white/40 italic p-2 rounded-lg bg-white/[0.02]">
                      No audio input devices found or permission not granted.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {audioDevices.map((dev, idx) => {
                        const isSelected =
                          selectedAudioDeviceId === dev.deviceId ||
                          (!selectedAudioDeviceId && idx === 0);
                        return (
                          <button
                            key={dev.deviceId || `mic-${idx}`}
                            type="button"
                            onClick={() => onSelectAudioDevice(dev.deviceId)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                              isSelected
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-white'
                                : 'border-white/5 bg-white/[0.03] text-white/70 hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className="truncate pr-2">
                              {dev.label || `Microphone ${idx + 1}`}
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={onClose}
                className="rounded-xl px-5 text-xs font-bold"
              >
                Done
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
