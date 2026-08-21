import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface MapPreviewProps {
  lat: number;
  lng: number;
  height?: string;
}

export const MapPreview: React.FC<MapPreviewProps> = ({ lat, lng, height = '320px' }) => {
  const [loaded, setLoaded] = useState(false);

  const src = useMemo(() => {
    const delta = 0.008;
    const minLon = lng - delta;
    const maxLon = lng + delta;
    const minLat = lat - delta;
    const maxLat = lat + delta;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lng}`;
  }, [lat, lng]);

  const prevCoords = useRef({ lat, lng });
  useEffect(() => {
    if (prevCoords.current.lat !== lat || prevCoords.current.lng !== lng) {
      setLoaded(false);
      prevCoords.current = { lat, lng };
    }
  }, [lat, lng]);

  const openInMaps = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-card-border bg-black/30"
      style={{ minHeight: height }}
    >
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 text-xs text-text/45">
          Loading map...
        </div>
      )}

      <iframe
        key={`${lat}-${lng}`}
        title="Location map"
        aria-label={`Map showing location at ${lat}, ${lng}`}
        src={src}
        className={cn(
          'w-full border-0 transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        style={{ height }}
        loading="lazy"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setLoaded(true)}
      />

      <button
        onClick={openInMaps}
        className="absolute top-3 left-3 rounded-full border border-white/10 bg-black/65 px-3 py-1 text-[10px] font-semibold text-white hover:bg-black/80"
      >
        Open Maps
      </button>
    </div>
  );
};
