import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';

interface MapPreviewProps {
  lat: number;
  lng: number;
  height?: string;
  className?: string;
}

export const MapPreview: React.FC<MapPreviewProps> = React.memo(
  ({ lat, lng, height = '320px', className }) => {
    const [loaded, setLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    const isValidCoords =
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    const src = useMemo(() => {
      if (!isValidCoords) return '';
      const delta = 0.008;
      const minLon = (lng - delta).toFixed(6);
      const maxLon = (lng + delta).toFixed(6);
      const minLat = (lat - delta).toFixed(6);
      const maxLat = (lat + delta).toFixed(6);
      return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lng}`;
    }, [lat, lng, isValidCoords]);

    const prevCoords = useRef({ lat, lng });
    useEffect(() => {
      if (prevCoords.current.lat !== lat || prevCoords.current.lng !== lng) {
        setLoaded(false);
        setHasError(false);
        prevCoords.current = { lat, lng };
      }
    }, [lat, lng]);

    const openInMaps = () => {
      if (!isValidCoords) return;
      try {
        window.open(
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`,
          '_blank',
          'noopener,noreferrer',
        );
      } catch (e) {
        logger.error('Failed to open map location', { error: e });
      }
    };

    if (!isValidCoords) {
      return (
        <div
          className={cn(
            'relative flex flex-col items-center justify-center rounded-3xl border border-card-border bg-black/30 p-4 text-center text-text/50',
            className,
          )}
          style={{ minHeight: height }}
        >
          <MapPin className="mb-2 h-6 w-6 text-text/30" />
          <span className="text-xs">Invalid coordinates provided</span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border border-card-border bg-black/30',
          className,
        )}
        style={{ minHeight: height }}
      >
        {!loaded && !hasError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 text-xs text-text/45">
            <RefreshCw className="h-4 w-4 animate-spin text-text/30" />
            <span>Loading map...</span>
          </div>
        )}

        {hasError ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-xs text-text/50">
            <AlertCircle className="h-5 w-5 text-red-400/80" />
            <span>Unable to display map preview</span>
            <button
              type="button"
              onClick={openInMaps}
              className="mt-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              Open in Google Maps
            </button>
          </div>
        ) : (
          <iframe
            key={`${lat}-${lng}`}
            title="Location map"
            aria-label={`Map showing location at ${lat}, ${lng}`}
            src={src}
            className={cn(
              'w-full border-0 transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            style={{ height }}
            loading="lazy"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setLoaded(true)}
            onError={() => setHasError(true)}
          />
        )}

        <button
          type="button"
          onClick={openInMaps}
          aria-label="Open location in external maps"
          className="absolute top-3 left-3 z-20 rounded-full border border-white/10 bg-black/65 px-3 py-1 text-[10px] font-semibold text-white shadow-md backdrop-blur-md hover:bg-black/85 active:scale-95 transition-all touch-manipulation cursor-pointer"
        >
          Open Maps
        </button>
      </div>
    );
  },
);

MapPreview.displayName = 'MapPreview';
