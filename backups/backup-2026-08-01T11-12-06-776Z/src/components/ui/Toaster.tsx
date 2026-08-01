import { Toaster as Sonner } from 'sonner'
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'

export const Toaster = () => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const position = isMobile ? 'bottom-right' : 'bottom-right'
  const offset = isMobile ? 12 : 10
  const gap = isMobile ? 8 : 10

  return (
    <Sonner
      position={position}
      offset={offset}
      theme="dark"
      className="toaster group"
      expand={false}
      duration={4000}
      visibleToasts={isMobile ? 2 : 4}
      gap={gap}
      // closeButton={true}
      swipeDirections={['left', 'right']}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'group toast border border-white/20 bg-black/95 backdrop-blur-lg text-white rounded-xl sm:rounded-2xl px-2 py-2 sm:px-3 sm:py-3 text-xs font-medium w-[calc(100vw-16px)] max-w-[360px] sm:w-[360px] shadow-[0_4px_20px_rgba(255,255,255,0.1)] overflow-visible transform-gpu will-change-transform transition-[transform,opacity,filter] duration-300 ease-out motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-5 motion-safe:zoom-in-95 motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:data-[removed=true]:animate-out motion-safe:data-[removed=true]:fade-out motion-safe:data-[removed=true]:slide-out-to-right-5 motion-safe:data-[removed=true]:zoom-out-95 motion-safe:data-[removed=true]:duration-300 motion-safe:data-[removed=true]:ease-in motion-reduce:transition-none motion-reduce:animate-none',

          success: 'shadow-[inset_3px_0_0_0_rgba(16,185,129,0.95)]',

          warning: 'shadow-[inset_3px_0_0_0_rgba(245,158,11,0.95)]',

          error: 'shadow-[inset_3px_0_0_0_rgba(239,68,68,0.95)]',

          info: 'shadow-[inset_3px_0_0_0_rgba(59,130,246,0.95)]',

          loader: 'text-white/70',

          title: 'text-[12px] leading-tight',

          description:
            'text-white/75 text-[11px] font-normal mt-1 leading-snug',

          actionButton:
            'bg-white text-black hover:bg-white/90 transition rounded-lg font-semibold px-3 py-1.5 text-[11px]',

          cancelButton:
            'bg-white/10 text-white hover:bg-white/20 transition rounded-lg font-semibold px-3 py-1.5 text-[11px]',

          // closeButton:
          //   'bg-white/10 hover:bg-white/20 text-white rounded-full p-1 transition-colors opacity-70 hover:opacity-100',
        },
      }}
      icons={{
        success: (
          <CheckCircle2 className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-emerald-400" />
        ),
        info: <Info className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-blue-400" />,
        warning: (
          <AlertTriangle className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-amber-400" />
        ),
        error: (
          <AlertCircle className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-red-400" />
        ),
      }}
    />
  )
}
