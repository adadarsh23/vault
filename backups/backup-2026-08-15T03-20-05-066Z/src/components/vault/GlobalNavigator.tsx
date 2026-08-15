import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

interface GlobalNavigatorProps {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  layout?: 'inline' | 'overlay';
  className?: string;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const GlobalNavigator: React.FC<GlobalNavigatorProps> = ({
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  layout = 'inline',
  className = '',
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === 'ArrowLeft' && canPrevious) {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === 'ArrowRight' && canNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canPrevious, canNext, onPrevious, onNext]);

  if (layout === 'overlay') {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className={`absolute left-4 top-1/2 z-50 -translate-y-1/2 text-white disabled:opacity-30 ${className}`.trim()}
          onClick={onPrevious}
          disabled={!canPrevious}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={`absolute right-4 top-1/2 z-50 -translate-y-1/2 text-white disabled:opacity-30 ${className}`.trim()}
          onClick={onNext}
          disabled={!canNext}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </>
    );
  }

  return (
    <div className={`flex gap-2 ${className}`.trim()}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        className="h-9 w-9"
        disabled={!canPrevious}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onNext} className="h-9 w-9" disabled={!canNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
