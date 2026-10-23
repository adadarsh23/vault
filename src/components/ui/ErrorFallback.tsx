import { AlertCircle, RefreshCw } from 'lucide-react';

export type ErrorFallbackProps = {
  label?: string;
  onRetry?: () => void;
  resetErrorBoundary?: () => void;
};

export function ErrorFallback({
  label = 'Something went wrong while loading this section.',
  onRetry,
  resetErrorBoundary,
}: ErrorFallbackProps) {
  const handleRetry = onRetry || resetErrorBoundary;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="
        flex min-h-screen w-full
        flex-col items-center justify-center
        gap-3 sm:gap-4
        px-4 sm:px-6 md:px-10
        text-center
        bg-card-bg/40 backdrop-blur-sm
      "
    >
      <div
        className="
          w-full max-w-md sm:max-w-lg
          rounded-2xl sm:rounded-3xl
          border border-card-border
          px-5 sm:px-8 py-8 sm:py-12
          bg-card-bg/60
          shadow-lg
          flex flex-col items-center
        "
      >
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>

        <p className="text-base sm:text-lg font-semibold text-text">Unable to continue</p>

        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-text/60 max-w-sm">{label}</p>

        {handleRetry && (
          <button
            type="button"
            onClick={handleRetry}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl transition-all active:scale-95 touch-manipulation"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorFallback;
