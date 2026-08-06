// SmartAvatar.tsx
// High-Performance React Component with CLS = 0, BlurHash Placeholder, and Offline Status

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { blurHashToDataUrl } from '../lib/blurhash';
import { Camera, AlertCircle, CloudOff, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils'; // Assuming you have a cn utility for classnames

export interface SmartAvatarProps {
  src?: string | null;
  blurHash?: string | null;
  name?: string;
  size?: number; // Size in px (default: 96)
  alt?: string;
  isProcessing?: boolean;
  isUploading?: boolean;
  uploadProgress?: number; // 0-100
  isOfflineQueued?: boolean;
  error?: string | null;
  onFileSelect?: (file: File) => void;
  onValidationError?: (message: string) => void;
  className?: string;
  acceptedFormats?: string;
  maxSizeInMb?: number;
  fetchPriority?: 'high' | 'low' | 'auto';
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
    fetchPriority,
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const cleanSrc = useMemo(() => {
      if (!src || typeof src !== 'string') return null;
      const trimmed = src.trim();
      if (!trimmed || trimmed.toLowerCase() === 'none') return null;
      return trimmed;
    }, [src]);

    // Extract initials for fallback monogram
    const initials = useMemo(() => {
      if (!name) return 'U';
      const parts = name.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      } else if (parts.length === 1 && parts[0].length > 0) {
        return parts[0].substring(0, 2).toUpperCase();
      }
      return 'U';
    }, [name]);

    // Reset and verify image load state whenever `cleanSrc` changes
    useEffect(() => {
      if (!cleanSrc) {
        setImageLoaded(false);
        setImageError(false);
        return;
      } else {
        // Reset state for new image
        setImageLoaded(false);
        setImageError(false);
      }

      const img = imgRef.current;
      if (img && img.src === cleanSrc) {
        if (img.complete) {
          // If image is already in the DOM and loaded (e.g. from cache), update state immediately
          setImageLoaded(img.naturalWidth > 0);
          setImageError(img.naturalWidth === 0);
        }
      }
    }, [cleanSrc]);

    // Compute BlurHash micro-placeholder Data URL
    const blurDataUrl = useMemo(() => {
      if (!blurHash) return null;
      return blurHashToDataUrl(blurHash, 16, 16);
    }, [blurHash]);

    const clampedProgress = useMemo(
      () => Math.min(100, Math.max(0, uploadProgress ?? 0)),
      [uploadProgress]
    );

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target;
      try {
        const file = target.files?.[0];
        if (!file || !onFileSelect) return;

        // Basic client-side validation
        if (
          !acceptedFormats
            .split(',')
            .map((type) => type.trim())
            .includes(file.type)
        ) {
          const message = `Invalid file type. Please select one of: ${acceptedFormats}`;
          if (onValidationError) {
            onValidationError(message);
          } else {
            console.warn(`SmartAvatar validation error: ${message}`);
          }
          return;
        }
        if (file.size > maxSizeInMb * 1024 * 1024) {
          const message = `File is too large. Maximum size is ${maxSizeInMb}MB.`;
          if (onValidationError) {
            onValidationError(message);
          } else {
            console.warn(`SmartAvatar validation error: ${message}`);
          }
          return;
        }
        onFileSelect(file);
      } finally {
        // Always reset file input value to allow selecting the same file again
        if (target) {
          target.value = '';
        }
      }
    };

    return (
      <div
        className={cn(
          'relative inline-block select-none overflow-hidden rounded-full transition-transform active:scale-95 focus-within:ring-2 focus-within:ring-indigo-900 focus-within:ring-offset-2 focus-within:ring-offset-white',
          onFileSelect && 'cursor-pointer group',
          className
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          contain: 'strict',
        }}
        aria-label={alt}
        role={onFileSelect ? 'button' : 'img'}
        tabIndex={onFileSelect ? 0 : -1}
        onKeyDown={
          onFileSelect
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }
            : undefined
        }
      >
        {/* Hidden File Input */}
        {onFileSelect && (
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats}
            style={{
              border: 0,
              clip: 'rect(0 0 0 0)',
              height: 1,
              margin: -1,
              overflow: 'hidden',
              padding: 0,
              position: 'absolute',
              width: 1,
            }}
            onChange={handleFileChange}
            tabIndex={-1}
          />
        )}

        {/* 1. Micro-Placeholder BlurHash Background */}
        {blurDataUrl && !imageLoaded && !imageError && (
          <img
            src={blurDataUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover scale-110 filter blur-sm transition-opacity duration-300 pointer-events-none"
            draggable={false}
            style={{ width: `${size}px`, height: `${size}px`, aspectRatio: '1 / 1' }}
          />
        )}

        {/* 2. Fallback Monogram (rendered on error or missing cleanSrc) */}
        {(imageError || (!cleanSrc && !blurDataUrl)) && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 text-white font-bold tracking-wider uppercase shadow-inner"
            style={{ fontSize: `${Math.max(12, Math.floor(size * 0.38))}px` }}
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
            loading="lazy"
            fetchPriority={fetchPriority}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={() => {
              setImageLoaded(true);
              setImageError(false);
            }}
            onError={() => setImageError(true)}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{ width: `${size}px`, height: `${size}px`, aspectRatio: '1 / 1' }}
          />
        )}

        {/* 4. Processing / Uploading Overlay */}
        {(isProcessing || isUploading) && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white transition-opacity"
            aria-live="polite"
            aria-busy="true"
          >
            {isUploading && typeof uploadProgress === 'number' ? (
              (() => {
                const ringSize = size * 0.5;
                const radius = ringSize / 2 - 4;
                const circumference = 2 * Math.PI * radius;
                return (
                  <div className="relative flex items-center justify-center">
                    <svg
                      className="transform -rotate-90"
                      width={ringSize}
                      height={ringSize}
                      viewBox={`0 0 ${ringSize} ${ringSize}`}
                    >
                      <circle
                        cx={ringSize / 2}
                        cy={ringSize / 2}
                        r={radius}
                        stroke="rgba(255, 255, 255, 0.2)"
                        strokeWidth="4"
                        fill="transparent"
                      />
                      <circle
                        cx={ringSize / 2}
                        cy={ringSize / 2}
                        r={radius}
                        stroke="rgb(129 140 248)"
                        strokeWidth="4"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - clampedProgress / 100)}
                        strokeLinecap="round"
                        className="transition-[stroke-dashoffset] duration-300"
                      />
                    </svg>
                    <span className="absolute text-xs font-bold">{`${Math.round(clampedProgress)}%`}</span>
                  </div>
                );
              })()
            ) : (
              <>
                <Loader2 className="w-1/3 h-1/3 animate-spin text-indigo-400" />
                <span className="text-[10px] font-medium mt-1 uppercase tracking-wider">
                  {isProcessing ? 'Processing' : 'Uploading'}
                </span>
              </>
            )}
          </div>
        )}

        {/* 5. Hover Upload Prompt Badge */}
        {onFileSelect && !isProcessing && !isUploading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white"
            aria-label="Upload new profile photo"
            aria-hidden="true"
          >
            <Camera className="w-1/3 h-1/3 drop-shadow-md" />
          </div>
        )}

        {/* 6. Offline Queued Badge Indicator */}
        {isOfflineQueued && (
          <div
            className="absolute bottom-0 right-0 p-1 bg-amber-500 text-white rounded-full border-2 border-white shadow-md"
            title="Avatar queued for sync when reconnected"
          >
            <CloudOff className="w-3 h-3" />
          </div>
        )}

        {/* 7. Error Badge */}
        {error && !isProcessing && !isUploading && (
          <div
            className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full border-2 border-white shadow-md"
            title={error}
          >
            <AlertCircle className="w-3 h-3" />
          </div>
        )}
      </div>
    );
  }
);
