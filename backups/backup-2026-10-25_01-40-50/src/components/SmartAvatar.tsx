// SmartAvatar.tsx
// High-Performance React Component with CLS = 0, BlurHash Placeholder, Offline Status, and Full Device Compatibility

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { blurHashToDataUrl } from '../lib/blurhash';
import { Camera, AlertCircle, CloudOff, Loader2, UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SmartAvatarProps {
  /** Image URL (HTTPS, HTTP, blob:, data:, or relative path) */
  src?: string | null;
  /** BlurHash string for instant micro-placeholder rendering */
  blurHash?: string | null;
  /** Name used for monogram initials fallback and accessibility */
  name?: string;
  /** Avatar diameter in pixels (default: 96) */
  size?: number;
  /** Alternative text for the image */
  alt?: string;
  /** Whether the avatar is currently being processed */
  isProcessing?: boolean;
  /** Whether a new photo is currently being uploaded */
  isUploading?: boolean;
  /** Upload progress percentage from 0 to 100 */
  uploadProgress?: number;
  /** Whether changes are queued for offline sync */
  isOfflineQueued?: boolean;
  /** Error message to display on the error badge */
  error?: string | null;
  /** Callback triggered when a valid file is selected or dropped */
  onFileSelect?: (file: File) => void;
  /** Callback triggered when file selection fails validation */
  onValidationError?: (message: string) => void;
  /** Extra class names for outer container */
  className?: string;
  /** Comma-separated list of accepted MIME types or extensions */
  acceptedFormats?: string;
  /** Maximum allowable file size in megabytes */
  maxSizeInMb?: number;
  /** Browser fetch priority hint */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Whether user interactions are disabled */
  disabled?: boolean;
  /** Optional inline styles */
  style?: React.CSSProperties;
  /** Optional click handler on the avatar container */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Cross-origin image attribute */
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
  /** Referrer policy for network image requests */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  /** Whether to allow drag-and-drop file upload (default: true if onFileSelect is present) */
  allowDragAndDrop?: boolean;
  /** Accessible label override */
  'aria-label'?: string;
}

/**
 * Validates a selected file against format and size constraints.
 */
export function validateAvatarFile(
  file: File,
  acceptedFormats: string,
  maxSizeInMb: number,
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // Size validation
  const maxBytes = maxSizeInMb * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb}MB). Maximum allowed size is ${maxSizeInMb}MB.`,
    };
  }

  // Format validation
  const rawTypes = acceptedFormats
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (rawTypes.length > 0) {
    const fileMime = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    const fileExt = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '';

    const matches = rawTypes.some((pattern) => {
      // Wildcard check (e.g., 'image/*')
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -1);
        return fileMime.startsWith(prefix);
      }
      // Extension check (e.g., '.jpg', '.png')
      if (pattern.startsWith('.')) {
        return fileExt === pattern;
      }
      // Normalize jpeg/jpg variations
      if (pattern === 'image/jpg' && fileMime === 'image/jpeg') return true;
      if (pattern === 'image/jpeg' && fileMime === 'image/jpg') return true;

      return fileMime === pattern;
    });

    if (!matches) {
      return {
        valid: false,
        error: `Invalid file format "${file.type || fileExt || 'unknown'}". Please select: ${acceptedFormats}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Extracts Unicode-safe monogram initials from a person or account name.
 */
function getSafeInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';

  const parts = trimmed.split(/[\s._\-@]+/).filter(Boolean);

  const extractFirstChar = (str: string): string => {
    // Array.from preserves Unicode surrogate pairs (e.g. emojis & non-BMP characters)
    const chars = Array.from(str);
    return chars.length > 0 ? chars[0] : '';
  };

  if (parts.length >= 2) {
    const first = extractFirstChar(parts[0]);
    const second = extractFirstChar(parts[1]);
    const combined = `${first}${second}`.toUpperCase();
    return combined || 'U';
  } else if (parts.length === 1) {
    const chars = Array.from(parts[0]);
    if (chars.length >= 2) {
      return `${chars[0]}${chars[1]}`.toUpperCase();
    } else if (chars.length === 1) {
      return chars[0].toUpperCase();
    }
  }
  return 'U';
}

/**
 * Curated accessible high-contrast gradient themes for initial monograms.
 */
const MONOGRAM_GRADIENTS = [
  'from-slate-800 to-zinc-950 border-white/10 text-slate-100',
  'from-indigo-900 to-slate-950 border-indigo-500/20 text-indigo-100',
  'from-blue-900 to-zinc-950 border-blue-500/20 text-blue-100',
  'from-teal-900 to-zinc-950 border-teal-500/20 text-teal-100',
  'from-emerald-900 to-slate-950 border-emerald-500/20 text-emerald-100',
  'from-violet-900 to-zinc-950 border-violet-500/20 text-violet-100',
  'from-rose-950 to-zinc-950 border-rose-500/20 text-rose-100',
  'from-amber-950 to-zinc-950 border-amber-500/20 text-amber-100',
];

function getMonogramTheme(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % MONOGRAM_GRADIENTS.length;
  return MONOGRAM_GRADIENTS[index];
}

export const SmartAvatar: React.FC<SmartAvatarProps> = React.memo(
  ({
    src,
    blurHash,
    name = 'User',
    size = 96,
    alt = 'Profile Photo',
    isProcessing = false,
    isUploading = false,
    uploadProgress,
    isOfflineQueued = false,
    error = null,
    onFileSelect,
    onValidationError,
    className = '',
    acceptedFormats = 'image/jpeg,image/png,image/webp,image/avif',
    maxSizeInMb = 5,
    fetchPriority = 'auto',
    disabled = false,
    style,
    onClick,
    crossOrigin,
    referrerPolicy = 'no-referrer',
    allowDragAndDrop = true,
    'aria-label': ariaLabelProp,
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const isMountedRef = useRef(true);

    // Track active mounted state to prevent state updates after unmount
    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    // Clean and validate the image source URL
    const cleanSrc = useMemo(() => {
      if (!src || typeof src !== 'string') return null;
      const trimmed = src.trim();
      if (
        !trimmed ||
        trimmed.toLowerCase() === 'none' ||
        trimmed.toLowerCase() === 'null' ||
        trimmed.toLowerCase() === 'undefined'
      ) {
        return null;
      }
      // Security: Disallow malicious script pseudo-schemes
      if (/^(javascript|vbscript|data:(?!image\/)):/i.test(trimmed)) {
        return null;
      }
      return trimmed;
    }, [src]);

    // Extract initials for fallback monogram
    const initials = useMemo(() => getSafeInitials(name), [name]);

    // Deterministic accessible theme for initials fallback
    const monogramTheme = useMemo(() => getMonogramTheme(name || 'User'), [name]);

    // Reset and synchronize image load state whenever `cleanSrc` changes
    useEffect(() => {
      if (!cleanSrc) {
        setImageLoaded(false);
        setImageError(false);
        return;
      }

      setImageLoaded(false);
      setImageError(false);

      // Fast cache check: if browser already cached the image, update state immediately
      const img = imgRef.current;
      if (img && img.complete) {
        if (img.naturalWidth > 0) {
          setImageLoaded(true);
          setImageError(false);
        } else {
          setImageError(true);
          setImageLoaded(false);
        }
      }
    }, [cleanSrc]);

    // Compute BlurHash micro-placeholder Data URL safely
    const blurDataUrl = useMemo(() => {
      if (!blurHash || typeof blurHash !== 'string' || blurHash.trim().length < 6) {
        return null;
      }
      try {
        return blurHashToDataUrl(blurHash.trim(), 16, 16);
      } catch (err) {
        console.warn('SmartAvatar: Failed to decode blurhash', err);
        return null;
      }
    }, [blurHash]);

    const clampedProgress = useMemo(
      () => Math.min(100, Math.max(0, uploadProgress ?? 0)),
      [uploadProgress],
    );

    const isInteractive = Boolean(onFileSelect);
    const isBusy = isProcessing || isUploading;
    const isDisabled = disabled || isBusy;

    const notifyValidationFailure = useCallback(
      (message: string) => {
        if (onValidationError) {
          onValidationError(message);
        } else {
          console.warn(`SmartAvatar validation error: ${message}`);
        }
      },
      [onValidationError],
    );

    const processSelectedFile = useCallback(
      (file: File) => {
        if (!onFileSelect || isDisabled) return;

        const validation = validateAvatarFile(file, acceptedFormats, maxSizeInMb);
        if (!validation.valid) {
          notifyValidationFailure(validation.error || 'Invalid file selection');
          return;
        }

        try {
          onFileSelect(file);
        } catch (err) {
          console.error('SmartAvatar: Error in onFileSelect handler', err);
        }
      },
      [acceptedFormats, isDisabled, maxSizeInMb, notifyValidationFailure, onFileSelect],
    );

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target;
      try {
        const file = target.files?.[0];
        if (file) {
          processSelectedFile(file);
        }
      } finally {
        if (target) {
          target.value = '';
        }
      }
    };

    const handleTriggerUpload = useCallback(() => {
      if (!isInteractive || isDisabled) return;
      fileInputRef.current?.click();
    }, [isDisabled, isInteractive]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (onClick) {
        onClick(e);
      }
      if (!e.defaultPrevented && isInteractive && !isDisabled) {
        handleTriggerUpload();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isInteractive && !isDisabled && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleTriggerUpload();
      }
    };

    // Drag-and-drop handling for desktop & tablets
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (!isInteractive || isDisabled || !allowDragAndDrop) return;
      e.preventDefault();
      e.stopPropagation();
      if (!isDragOver) setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      if (!isInteractive || isDisabled || !allowDragAndDrop) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      if (!isInteractive || isDisabled || !allowDragAndDrop) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processSelectedFile(files[0]);
      }
    };

    // Adaptive sizing calculations for badges, loaders, and progress rings
    const badgeSize = Math.max(14, Math.min(24, Math.round(size * 0.22)));
    const badgeIconSize = Math.max(8, Math.min(14, Math.round(badgeSize * 0.6)));
    const progressRingSize = Math.max(20, Math.round(size * 0.52));
    const strokeWidth = Math.max(2, Math.min(4, Math.round(progressRingSize * 0.08)));
    const radius = Math.max(3, progressRingSize / 2 - strokeWidth);
    const circumference = 2 * Math.PI * radius;
    const progressFontSize = Math.max(9, Math.min(13, Math.round(size * 0.16)));
    const monogramFontSize = Math.max(12, Math.floor(size * 0.38));

    const accessibleLabel =
      ariaLabelProp ||
      (isInteractive ? `Change profile photo for ${name}` : alt || `${name}'s avatar`);

    return (
      <div
        className={cn(
          'relative inline-flex items-center justify-center shrink-0 aspect-square select-none',
          className,
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          maxWidth: `${size}px`,
          maxHeight: `${size}px`,
          aspectRatio: '1 / 1',
          contain: 'layout style',
          touchAction: isInteractive ? 'manipulation' : undefined,
          WebkitTapHighlightColor: 'transparent',
          ...style,
        }}
      >
        {/* Hidden Accessible File Input */}
        {isInteractive && (
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats}
            disabled={isDisabled}
            aria-hidden="true"
            tabIndex={-1}
            style={{
              border: 0,
              clip: 'rect(0 0 0 0)',
              height: 1,
              margin: -1,
              overflow: 'hidden',
              padding: 0,
              position: 'absolute',
              width: 1,
              whiteSpace: 'nowrap',
            }}
            onChange={handleFileChange}
          />
        )}

        {/* Circular Inner Frame (Strictly Clipped with Rounded Full) */}
        <div
          role={isInteractive ? 'button' : 'img'}
          tabIndex={isInteractive && !isDisabled ? 0 : -1}
          aria-label={accessibleLabel}
          aria-disabled={isDisabled ? 'true' : undefined}
          aria-busy={isBusy ? 'true' : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative h-full w-full overflow-hidden rounded-full transition-all duration-200 outline-none select-none',
            isInteractive &&
              !isDisabled &&
              'cursor-pointer group active:scale-95 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isDragOver &&
              'ring-2 ring-indigo-500 ring-offset-2 ring-offset-background scale-[1.02]',
            isDisabled && isInteractive && 'cursor-not-allowed opacity-80',
          )}
          style={{ width: '100%', height: '100%', aspectRatio: '1 / 1' }}
        >
          {/* 1. Micro-Placeholder BlurHash Background */}
          {blurDataUrl && !imageLoaded && !imageError && (
            <img
              src={blurDataUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover scale-110 filter blur-sm transition-opacity duration-300 pointer-events-none"
              draggable={false}
              style={{ width: '100%', height: '100%', aspectRatio: '1 / 1' }}
            />
          )}

          {/* 2. Fallback Monogram (Rendered on Error, Missing Source, or While Loading with No BlurHash) */}
          {(imageError || (!cleanSrc && !blurDataUrl) || (!imageLoaded && !blurDataUrl)) && (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-gradient-to-br font-bold tracking-wider uppercase shadow-inner border transition-opacity duration-300',
                monogramTheme,
                imageLoaded && cleanSrc && 'opacity-0 pointer-events-none',
              )}
              style={{ fontSize: `${monogramFontSize}px` }}
              aria-hidden="true"
            >
              {initials}
            </div>
          )}

          {/* 3. Main Network High-Res Image */}
          {cleanSrc && !imageError && (
            <img
              ref={imgRef}
              src={cleanSrc}
              alt={alt}
              decoding="async"
              loading={fetchPriority === 'high' ? 'eager' : 'lazy'}
              fetchPriority={fetchPriority}
              crossOrigin={crossOrigin}
              draggable={false}
              referrerPolicy={referrerPolicy}
              onLoad={(e) => {
                if (!isMountedRef.current) return;
                const target = e.currentTarget;
                if (target.naturalWidth > 0) {
                  setImageLoaded(true);
                  setImageError(false);
                } else {
                  setImageError(true);
                  setImageLoaded(false);
                }
              }}
              onError={() => {
                if (!isMountedRef.current) return;
                setImageError(true);
                setImageLoaded(false);
              }}
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 pointer-events-none',
                imageLoaded ? 'opacity-100' : 'opacity-0',
              )}
              style={{ width: '100%', height: '100%', aspectRatio: '1 / 1' }}
            />
          )}

          {/* 4. Processing / Uploading Overlay */}
          {isBusy && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-white transition-opacity backdrop-blur-[1px] z-10"
              aria-live="polite"
              aria-busy="true"
            >
              {isUploading && typeof uploadProgress === 'number' ? (
                <div className="relative flex items-center justify-center">
                  <svg
                    className="transform -rotate-90"
                    width={progressRingSize}
                    height={progressRingSize}
                    viewBox={`0 0 ${progressRingSize} ${progressRingSize}`}
                  >
                    <circle
                      cx={progressRingSize / 2}
                      cy={progressRingSize / 2}
                      r={radius}
                      stroke="rgba(255, 255, 255, 0.2)"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                    />
                    <circle
                      cx={progressRingSize / 2}
                      cy={progressRingSize / 2}
                      r={radius}
                      stroke="rgb(129 140 248)"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - clampedProgress / 100)}
                      strokeLinecap="round"
                      className="transition-[stroke-dashoffset] duration-300"
                    />
                  </svg>
                  {size >= 56 && (
                    <span
                      className="absolute font-bold drop-shadow"
                      style={{ fontSize: `${progressFontSize}px` }}
                    >
                      {`${Math.round(clampedProgress)}%`}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <Loader2 className="w-1/3 h-1/3 animate-spin text-indigo-400" />
                  {size >= 64 && (
                    <span className="text-[10px] font-medium mt-1 uppercase tracking-wider text-zinc-200">
                      {isProcessing ? 'Processing' : 'Uploading'}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* 5. Drag-Over Prompt Overlay */}
          {isDragOver && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/80 text-indigo-200 z-10 backdrop-blur-[1px]"
              aria-hidden="true"
            >
              <UploadCloud className="w-1/3 h-1/3 animate-bounce text-white drop-shadow" />
              {size >= 64 && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white mt-1">
                  Drop image
                </span>
              )}
            </div>
          )}

          {/* 6. Interactive Hover Prompt Overlay */}
          {isInteractive && !isBusy && !isDragOver && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white backdrop-blur-[0.5px] z-10 pointer-events-none"
              aria-hidden="true"
            >
              <Camera className="w-1/3 h-1/3 drop-shadow-md text-white/90" />
            </div>
          )}
        </div>

        {/* 7. Offline Queued Badge Indicator (Positioned on outer wrapper to prevent circular clipping) */}
        {isOfflineQueued && (
          <div
            className="absolute bottom-0 right-0 flex items-center justify-center bg-amber-500 text-white rounded-full border-2 border-white dark:border-zinc-950 shadow-md z-20 pointer-events-auto"
            style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
            title="Avatar queued for sync when reconnected"
            role="status"
            aria-label="Offline sync queued"
          >
            <CloudOff style={{ width: `${badgeIconSize}px`, height: `${badgeIconSize}px` }} />
          </div>
        )}

        {/* 8. Error Badge (Positioned on outer wrapper to prevent circular clipping) */}
        {error && !isBusy && (
          <div
            className="absolute top-0 right-0 flex items-center justify-center bg-red-500 text-white rounded-full border-2 border-white dark:border-zinc-950 shadow-md z-20 pointer-events-auto"
            style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
            title={error}
            role="alert"
            aria-label={error}
          >
            <AlertCircle style={{ width: `${badgeIconSize}px`, height: `${badgeIconSize}px` }} />
          </div>
        )}
      </div>
    );
  },
);

SmartAvatar.displayName = 'SmartAvatar';
