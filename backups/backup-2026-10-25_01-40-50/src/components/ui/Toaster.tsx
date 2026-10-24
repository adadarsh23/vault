import React from 'react';
import { Toaster as Sonner } from 'sonner';
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export const Toaster: React.FC = () => {
  return (
    <Sonner
      position="bottom-right"
      offset={12}
      theme="dark"
      className="toaster group"
      expand={false}
      duration={4000}
      visibleToasts={3}
      gap={6}
      swipeDirections={['left', 'right', 'bottom']}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'group toast border border-white/20 bg-black/95 backdrop-blur-lg text-white rounded-xl sm:rounded-2xl px-2.5 py-2.5 sm:px-3 sm:py-3 text-xs font-medium w-[min(340px,calc(100vw-24px))] shadow-[0_4px_20px_rgba(255,255,255,0.1)] overflow-visible transform-gpu will-change-transform transition-[transform,opacity,filter] duration-300 ease-out motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-5 motion-safe:zoom-in-95 motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:data-[removed=true]:animate-out motion-safe:data-[removed=true]:fade-out motion-safe:data-[removed=true]:slide-out-to-right-5 motion-safe:data-[removed=true]:zoom-out-95 motion-safe:data-[removed=true]:duration-300 motion-safe:data-[removed=true]:ease-in motion-reduce:transition-none motion-reduce:animate-none touch-manipulation',

          success:
            'shadow-[inset_2.5px_0_0_0_rgba(16,185,129,0.95)] sm:shadow-[inset_3px_0_0_0_rgba(16,185,129,0.95)]',

          warning:
            'shadow-[inset_2.5px_0_0_0_rgba(245,158,11,0.95)] sm:shadow-[inset_3px_0_0_0_rgba(245,158,11,0.95)]',

          error:
            'shadow-[inset_2.5px_0_0_0_rgba(239,68,68,0.95)] sm:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.95)]',

          info: 'shadow-[inset_2.5px_0_0_0_rgba(59,130,246,0.95)] sm:shadow-[inset_3px_0_0_0_rgba(59,130,246,0.95)]',

          loader: 'text-white/70',

          title: 'text-[11px] sm:text-[12px] leading-tight font-medium',

          description:
            'text-white/75 text-[10px] sm:text-[11px] font-normal mt-0.5 sm:mt-1 leading-snug',

          actionButton:
            'bg-white text-black hover:bg-white/90 transition rounded-md sm:rounded-lg font-semibold px-2 py-0.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-[11px] touch-manipulation',

          cancelButton:
            'bg-white/10 text-white hover:bg-white/20 transition rounded-md sm:rounded-lg font-semibold px-2 py-0.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-[11px] touch-manipulation',
        },
      }}
      icons={{
        success: <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0" />,
        info: <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400 shrink-0" />,
        warning: <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 shrink-0" />,
        error: <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-400 shrink-0" />,
      }}
    />
  );
};

export default Toaster;
