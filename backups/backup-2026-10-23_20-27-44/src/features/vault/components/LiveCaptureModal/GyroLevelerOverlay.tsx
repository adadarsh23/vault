import React, { useState, useEffect, useRef } from 'react';
import { Compass, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { GyroLevelState } from './types';
import { triggerHaptic } from './haptics';

interface GyroLevelerOverlayProps {
  enabled: boolean;
  onLevelStateChange?: (state: GyroLevelState) => void;
}

export const GyroLevelerOverlay: React.FC<GyroLevelerOverlayProps> = ({
  enabled,
  onLevelStateChange,
}) => {
  const [gyroState, setGyroState] = useState<GyroLevelState>({
    roll: 0,
    pitch: 0,
    isLevel: true,
    supported: true,
    permissionGranted: true,
  });

  const wasLevelRef = useRef(false);
  const smoothedRollRef = useRef(0);
  const [manualTilt, _setManualTilt] = useState<number | null>(null);
  const [needsPermissionGesture, setNeedsPermissionGesture] = useState(false);

  // Request sensor permissions on user gesture
  const requestSensorPermission = async () => {
    try {
      if (
        typeof (DeviceOrientationEvent as any) !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res === 'granted') {
          setNeedsPermissionGesture(false);
          setGyroState((prev) => ({ ...prev, permissionGranted: true }));
          triggerHaptic('success');
        } else {
          setGyroState((prev) => ({ ...prev, permissionGranted: false }));
        }
      }
      if (
        typeof (DeviceMotionEvent as any) !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function'
      ) {
        await (DeviceMotionEvent as any).requestPermission();
      }
    } catch {
      /* ignore permission prompt rejections */
    }
  };

  useEffect(() => {
    if (!enabled) return;

    let hasReceivedSensor = false;

    // Check if permission is needed on iOS 13+
    if (
      typeof (DeviceOrientationEvent as any) !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      setNeedsPermissionGesture(true);
    }

    const processRollAngle = (rawRoll: number, rawPitch = 0) => {
      hasReceivedSensor = true;
      setNeedsPermissionGesture(false);

      // Low-pass exponential smoothing for silky-smooth motion without jitter
      const alpha = 0.25;
      smoothedRollRef.current = smoothedRollRef.current * (1 - alpha) + rawRoll * alpha;

      const rounded = Number(smoothedRollRef.current.toFixed(1));
      const clampedRoll = Math.max(-90, Math.min(90, rounded));
      const isLevel = Math.abs(clampedRoll) <= 1.0;

      // Haptic snap on entering level
      if (isLevel && !wasLevelRef.current) {
        triggerHaptic('tick');
      }
      wasLevelRef.current = isLevel;

      const newState: GyroLevelState = {
        roll: isLevel ? 0 : clampedRoll,
        pitch: rawPitch,
        isLevel,
        supported: true,
        permissionGranted: true,
      };

      setGyroState(newState);
      onLevelStateChange?.(newState);
    };

    // 1. High-accuracy DeviceMotion Listener (Gravity Vector)
    const handleDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null) return;

      const ax = acc.x;
      const ay = acc.y;
      const az = acc.z ?? 0;

      const orientationAngle = window.screen.orientation?.angle ?? (window as any).orientation ?? 0;

      let angle = 0;
      if (orientationAngle === 90) {
        angle = Math.atan2(-ay, ax) * (180 / Math.PI);
      } else if (orientationAngle === 270 || orientationAngle === -90) {
        angle = Math.atan2(ay, -ax) * (180 / Math.PI);
      } else if (orientationAngle === 180) {
        angle = Math.atan2(-ax, -ay) * (180 / Math.PI);
      } else {
        // Portrait (0 deg)
        angle = Math.atan2(ax, ay) * (180 / Math.PI);
      }

      processRollAngle(angle, az);
    };

    // 2. Fallback DeviceOrientation Listener
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;

      const orientationAngle = window.screen.orientation?.angle ?? (window as any).orientation ?? 0;

      let roll = 0;
      let pitch = 0;

      if (orientationAngle === 90) {
        roll = -e.beta;
        pitch = e.gamma;
      } else if (orientationAngle === -90 || orientationAngle === 270) {
        roll = e.beta;
        pitch = -e.gamma;
      } else if (orientationAngle === 180) {
        roll = -e.gamma;
        pitch = -e.beta;
      } else {
        // Portrait
        if (Math.abs(e.beta) > 45) {
          // Upright camera holding
          roll = e.gamma * (e.beta < 0 ? -1 : 1);
        } else {
          roll = e.gamma;
        }
        pitch = e.beta;
      }

      processRollAngle(roll, pitch);
    };

    window.addEventListener('devicemotion', handleDeviceMotion, true);
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);

    // If sensors are not emitting on desktop after 1000ms, mark as unsupported
    const timer = setTimeout(() => {
      if (!hasReceivedSensor) {
        setGyroState((prev) => ({
          ...prev,
          supported: false,
        }));
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('devicemotion', handleDeviceMotion, true);
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    };
  }, [enabled, onLevelStateChange]);

  if (!enabled) return null;

  const currentRoll = manualTilt !== null ? manualTilt : gyroState.roll;
  const isLevel = Math.abs(currentRoll) <= 1.0;

  return (
    <div className="absolute inset-0 pointer-events-none z-25 flex items-center justify-center overflow-hidden">
      {/* iOS Permission Prompt Overlay */}
      {needsPermissionGesture && !gyroState.supported && (
        <div className="pointer-events-auto absolute top-14 z-40 flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[10px] text-white border border-white/15 shadow-xl backdrop-blur-xl">
          <ShieldAlert className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>Enable sensors for leveler</span>
          <button
            type="button"
            onClick={requestSensorPermission}
            className="rounded-full bg-emerald-400 px-2.5 py-0.5 font-bold text-black hover:bg-emerald-300 active:scale-95 text-[9px]"
          >
            Allow
          </button>
        </div>
      )}

      {/* Slender Professional Horizon Reticle ("patli line") */}
      <div
        className="relative flex items-center justify-center transition-transform duration-100 ease-out"
        style={{
          transform: `rotate(${-currentRoll}deg)`,
        }}
      >
        {/* Left Horizon Line (Slender / Patli Line) */}
        <div
          className={cn(
            'w-14 sm:w-20 md:w-28 rounded-full transition-all duration-150',
            isLevel
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)] h-[1.5px]'
              : 'bg-white/70 shadow-sm h-[1px]',
          )}
        />

        {/* Center Precision Ring */}
        <div
          className={cn(
            'w-5 h-5 sm:w-6 sm:h-6 mx-2 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-150 shrink-0',
            isLevel
              ? 'border-emerald-400 bg-emerald-400/20 shadow-[0_0_12px_rgba(52,211,153,0.6)] scale-105'
              : 'border-white/40 bg-black/20',
          )}
        >
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-150',
              isLevel
                ? 'bg-emerald-300 shadow-[0_0_6px_rgba(52,211,153,1)] scale-110'
                : 'bg-white/80',
            )}
          />
        </div>

        {/* Right Horizon Line (Slender / Patli Line) */}
        <div
          className={cn(
            'w-14 sm:w-20 md:w-28 rounded-full transition-all duration-150',
            isLevel
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)] h-[1.5px]'
              : 'bg-white/70 shadow-sm h-[1px]',
          )}
        />
      </div>

      {/* Tilt Angle Readout Badge - Small, Clean & Responsive */}
      <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-black/80 px-2.5 sm:px-3 py-0.5 sm:py-1 backdrop-blur-xl border border-white/15 text-white shadow-xl pointer-events-none">
        <Compass
          className={cn(
            'h-3 w-3 sm:h-3.5 sm:w-3.5 transition-colors shrink-0',
            isLevel ? 'text-emerald-400 animate-pulse' : 'text-white/60',
          )}
        />
        <span
          className={cn(
            'font-mono text-[10px] sm:text-xs font-bold tracking-tight tabular-nums',
            isLevel ? 'text-emerald-400' : 'text-white/90',
          )}
        >
          {isLevel ? '0.0° LEVEL' : `${currentRoll > 0 ? '+' : ''}${currentRoll.toFixed(1)}°`}
        </span>
        {isLevel && (
          <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400 shrink-0" />
        )}
      </div>
    </div>
  );
};
