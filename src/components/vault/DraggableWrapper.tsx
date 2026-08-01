import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface DraggableWrapperProps {
  id: string;
  data: any;
  children: React.ReactNode;
  className?: string;
}

export const DraggableWrapper: React.FC<DraggableWrapperProps> = ({
  id,
  data,
  children,
  className,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? ('relative' as const) : ('static' as const),
    zIndex: isDragging ? 999 : 'auto',
    touchAction: 'pan-y', // Changed from 'none' to allow vertical scrolling on touch screens while still supporting dnd
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={className}>
      {children}
    </div>
  );
};
