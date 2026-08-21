import React, { useMemo } from 'react';
import { getDeviceId } from '../../lib/auth-session';
import { getSessionIdentifier } from '../../lib/activity';

export interface ForensicWatermarkProps {
  userId?: string;
  classification?: string;
  opacity?: number;
  angle?: number;
  density?: 'standard' | 'compact' | 'dense' | string;
  customText?: string;
  className?: string;
}

export const ForensicWatermark: React.FC<ForensicWatermarkProps> = ({
  userId,
  classification = 'CONFIDENTIAL',
  opacity = 0.12,
  angle = -25,
  density = 'standard',
  customText,
  className = '',
}) => {
  const deviceId = useMemo(() => {
    try {
      return getDeviceId();
    } catch {
      return 'unknown-device';
    }
  }, []);

  const sessionIdentifier = useMemo(() => {
    try {
      return getSessionIdentifier();
    } catch {
      return 'unknown-session';
    }
  }, []);

  const displayUser = userId || 'user@vault.internal';
  const patternId = useMemo(
    () => `forensic-pattern-${Math.random().toString(36).substring(2, 9)}`,
    []
  );

  const patternDimensions = useMemo(() => {
    switch (density) {
      case 'compact':
        return { width: 260, height: 160 };
      case 'dense':
        return { width: 220, height: 130 };
      case 'standard':
      default:
        return { width: 340, height: 220 };
    }
  }, [density]);

  return (
    <div
      data-testid="forensic-watermark"
      className={`pointer-events-none absolute inset-0 z-30 select-none overflow-hidden ${className}`}
      style={{ opacity: String(opacity) }}
      aria-hidden="true"
    >
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id={patternId}
            width={patternDimensions.width}
            height={patternDimensions.height}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${angle})`}
          >
            <text
              x="20"
              y="40"
              fill="currentColor"
              className="text-xs font-mono font-bold uppercase tracking-wider fill-white/80"
            >
              {customText ? customText : `USER: ${displayUser}`}
            </text>
            <text
              x="20"
              y="75"
              fill="currentColor"
              className="text-[10px] font-mono tracking-wide fill-white/60"
            >
              {customText
                ? `LEAK-TRACE: ${deviceId}`
                : `${classification} • LEAK-TRACE: ${deviceId.slice(0, 12)}`}
            </text>
            <text x="20" y="110" fill="currentColor" className="text-[9px] font-mono fill-white/40">
              {`SES: ${sessionIdentifier.slice(0, 12)}`}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      {/* Perimeter leak-trace stamp */}
      <div className="absolute bottom-1 right-2 font-mono text-[9px] text-white/30 tracking-tighter">
        LEAK-TRACE: {deviceId.slice(0, 8)} | SES: {sessionIdentifier.slice(0, 8)}
      </div>
    </div>
  );
};

export default ForensicWatermark;
