import React, { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface DraggableWrapperProps {
  id: string;
  data?: Record<string, unknown> | unknown;
  children: React.ReactNode;
  className?: string;
}

export const DraggableWrapper: React.FC<DraggableWrapperProps> = React.memo(
  ({ id, data, children, className }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id,
      data: data as Record<string, unknown> | undefined,
    });

    const style = useMemo(
      () => ({
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        position: isDragging ? ('relative' as const) : ('static' as const),
        zIndex: isDragging ? 999 : 'auto',
        touchAction: 'pan-y' as const, // Allows vertical scrolling on touch screens while still supporting drag & drop
        willChange: isDragging ? 'transform, opacity' : 'auto',
      }),
      [transform, isDragging],
    );

    return (
      <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={className}>
        {children}
      </div>
    );
  },
);

DraggableWrapper.displayName = 'DraggableWrapper';
