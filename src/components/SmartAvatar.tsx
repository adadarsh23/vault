// SmartAvatar.tsx
// High-Performance React Component with CLS = 0, BlurHash Placeholder, and Offline Status

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { blurHashToDataUrl } from '../lib/blurhash';
import { Camera, AlertCircle, CloudOff, Loader2 } from 'lucide-react';

export interface SmartAvatarProps {
  src?: string | null;
  blurHash?: string | null;
  name?: string;
  size?: number; // Size in px (default: 96)
  alt?: string;
  isProcessing?: boolean;
  isUploading?: boolean;
  isOfflineQueued?: boolean;
  error?: string | null;
  onFileSelect?: (file: File) => void;
  className?: string;
}

export const SmartAvatar: React.FC<SmartAvatarProps> = React.memo(({
  src,
  blurHash,
  name = 'User',
  size = 96,
  alt = 'Profile Photo',
  isProcessing = false,
  isUploading = false,
  isOfflineQueued = false,
  error = null,
  onFileSelect,
  className = '',
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract initials for fallback monogram
  const initials = useMemo(() => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }, [name]);

  // Reset image load state whenever `src` changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [src]);

  // Compute BlurHash micro-placeholder Data URL
  const blurDataUrl = useMemo(() => {
    if (!blurHash) return null;
    return blurHashToDataUrl(blurHash, 16, 16);
  }, [blurHash]);

  const handleContainerClick = () => {
    if (onFileSelect && !isProcessing && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) {
      onFileSelect(file);
    }
    // Reset file input value to allow selecting the same file again
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div
      className={`relative inline-block select-none overflow-hidden rounded-full transition-transform active:scale-95 ${
        onFileSelect ? 'cursor-pointer group' : ''
      } ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        aspectRatio: '1 / 1',
        contain: 'layout paint',
        boxSizing: 'border-box',
      }}
      onClick={handleContainerClick}
      aria-label={alt}
      role={onFileSelect ? 'button' : 'img'}
      tabIndex={onFileSelect ? 0 : undefined}
    >
      {/* Hidden File Input */}
      {onFileSelect && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
          className="hidden"
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
          style={{ width: `${size}px`, height: `${size}px`, aspectRatio: '1 / 1' }}
        />
      )}

      {/* 2. Fallback Monogram (rendered on error or missing src) */}
      {(imageError || (!src && !blurDataUrl)) && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/15 via-zinc-950 to-black border border-white/10 text-white font-bold tracking-wider uppercase shadow-inner"
          style={{ fontSize: `${Math.max(12, Math.floor(size * 0.38))}px` }}
        >
          {initials}
        </div>
      )}

      {/* 3. Main Network High-Res Image */}
      {src && !imageError && (
        <img
          src={src}
          alt={alt}
          decoding="async"
          loading="eager"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ width: `${size}px`, height: `${size}px`, aspectRatio: '1 / 1' }}
        />
      )}

      {/* 4. Processing / Uploading Overlay Spinner */}
      {(isProcessing || isUploading) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white transition-opacity">
          <Loader2 className="w-1/3 h-1/3 animate-spin text-indigo-400" />
          <span className="text-[10px] font-medium mt-1 uppercase tracking-wider">
            {isProcessing ? 'Processing' : 'Uploading'}
          </span>
        </div>
      )}

      {/* 5. Hover Upload Prompt Badge */}
      {onFileSelect && !isProcessing && !isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white">
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
});
