type ErrorFallbackProps = {
  label?: string
}

export function ErrorFallback({
  label = 'Something went wrong while loading this section.',
}: ErrorFallbackProps) {
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
      px-5 sm:px-8 py-10 sm:py-12
      bg-card-bg/60
      shadow-lg
    "
      >
        <p className="text-base sm:text-lg font-semibold text-text">
          Unable to continue
        </p>

        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-text/60">
          {label}
        </p>
      </div>
    </div>
  )
}
