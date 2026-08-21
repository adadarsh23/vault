import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

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
        {/* Left Arrow Button (Pushed to far left, invisible background) */}
        <button
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Previous item (Left Arrow)"
          title="Previous (Arrow Left)"
          className={cn(
            'absolute left-1 sm:left-2 md:left-3 top-1/2 -translate-y-1/2 z-40 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-transparent hover:bg-white/15 active:bg-white/25 text-white/70 hover:text-white transition-all active:scale-95 disabled:opacity-0 pointer-events-auto select-none',
            className
          )}
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
        </button>

        {/* Right Arrow Button (Pushed to far right, invisible background) */}
        <button
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next item (Right Arrow)"
          title="Next (Arrow Right)"
          className={cn(
            'absolute right-1 sm:right-2 md:right-3 top-1/2 -translate-y-1/2 z-40 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-transparent hover:bg-white/15 active:bg-white/25 text-white/70 hover:text-white transition-all active:scale-95 disabled:opacity-0 pointer-events-auto select-none',
            className
          )}
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
        </button>
      </>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 sm:gap-2', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-transparent hover:bg-white/10"
        disabled={!canPrevious}
        aria-label="Previous item"
      >
        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-transparent hover:bg-white/10"
        disabled={!canNext}
        aria-label="Next item"
      >
        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]" />
      </Button>
    </div>
  );
};
