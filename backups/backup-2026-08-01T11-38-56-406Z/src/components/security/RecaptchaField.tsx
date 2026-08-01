import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReCAPTCHA from 'react-google-recaptcha'
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThemeStore } from '../../store/themeStore'
import type { RecaptchaStatus } from '../../hooks/useRecaptchaChallenge'

interface RecaptchaFieldProps {
  id: string
  token: string | null
  status: RecaptchaStatus
  message?: string | null
  resetNonce?: number
  disabled?: boolean
  className?: string
  onChange: (token: string | null) => void
  onExpired: () => void
  onError: () => void
}

const RECAPTCHA_MISSING_SITE_KEY_MESSAGE =
  'Security challenge is unavailable. Configure VITE_RECAPTCHA_SITE_KEY with a reCAPTCHA v2 Checkbox site key.'
const RECAPTCHA_LOADING_MESSAGE = 'Loading security challenge...'
const RECAPTCHA_PENDING_MESSAGE =
  'Complete CAPTCHA before submitting this form.'
const RECAPTCHA_LOAD_ERROR_MESSAGE =
  'Security challenge failed to load. Use a reCAPTCHA v2 Checkbox key and allow Google reCAPTCHA domains in CSP.'
const RECAPTCHA_WIDTH = 304
const RECAPTCHA_HEIGHT = 78
const RECAPTCHA_MIN_SCALE = 0.6
const RECAPTCHA_SCRIPT_TIMEOUT_MS = 12_000
type RecaptchaWidgetState = 'loading' | 'ready' | 'error'

export const RecaptchaField = ({
  id,
  token,
  status,
  message,
  resetNonce = 0,
  disabled = false,
  className,
  onChange,
  onExpired,
  onError,
}: RecaptchaFieldProps) => {
  const selectedTheme = useThemeStore((state) => state.theme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [widgetScale, setWidgetScale] = useState(1)
  const [widgetState, setWidgetState] =
    useState<RecaptchaWidgetState>('loading')
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() || ''

  const blurRecaptchaFocus = useCallback(() => {
    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement &&
      wrapperRef.current?.contains(activeElement)
    ) {
      activeElement.blur()
    }
  }, [])

  useEffect(() => {
    blurRecaptchaFocus()
    recaptchaRef.current?.reset()
  }, [blurRecaptchaFocus, resetNonce])

  useEffect(() => {
    return () => {
      blurRecaptchaFocus()
    }
  }, [blurRecaptchaFocus])

  useEffect(() => {
    if (!siteKey) {
      return
    }

    setWidgetState('loading')
    const timeoutId = window.setTimeout(() => {
      setWidgetState((current) => (current === 'ready' ? current : 'error'))
    }, RECAPTCHA_SCRIPT_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [siteKey, resolvedTheme])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || typeof ResizeObserver === 'undefined') {
      return
    }

    const updateScale = () => {
      const availableWidth = wrapper.clientWidth - 2
      if (availableWidth <= 0) {
        return
      }

      const nextScale = Math.min(
        1,
        Math.max(RECAPTCHA_MIN_SCALE, availableWidth / RECAPTCHA_WIDTH),
      )

      setWidgetScale((current) =>
        Math.abs(current - nextScale) < 0.01 ? current : nextScale,
      )
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(wrapper)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (selectedTheme === 'dark') {
      setResolvedTheme('dark')
      return
    }

    if (selectedTheme === 'light') {
      setResolvedTheme('light')
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setResolvedTheme(media.matches ? 'dark' : 'light')
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [selectedTheme])

  const isCompleted = Boolean(token)
  const hasErrorState = status === 'error' || widgetState === 'error'
  const isLoadingState = widgetState === 'loading' && !isCompleted

  const statusText = useMemo(() => {
    if (message) {
      return message
    }

    if (isCompleted || status === 'verified') {
      return 'CAPTCHA completed.'
    }

    if (status === 'expired') {
      return 'CAPTCHA expired. Please complete it again.'
    }

    if (hasErrorState) {
      return RECAPTCHA_LOAD_ERROR_MESSAGE
    }

    if (isLoadingState) {
      return RECAPTCHA_LOADING_MESSAGE
    }

    return RECAPTCHA_PENDING_MESSAGE
  }, [hasErrorState, isCompleted, isLoadingState, message, status])

  const handleChange = useCallback(
    (nextToken: string | null) => {
      setWidgetState('ready')
      onChange(nextToken)
    },
    [onChange],
  )

  const handleScriptLoad = useCallback(() => {
    setWidgetState('ready')
  }, [])

  const handleWidgetError = useCallback(() => {
    setWidgetState('error')
    onError()
  }, [onError])

  if (!siteKey) {
    return (
      <div
        className={cn(
          'rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200',
          className,
        )}
        role="alert"
      >
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{RECAPTCHA_MISSING_SITE_KEY_MESSAGE}</span>
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn('space-y-2', className)}
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-status`}
    >
      <p
        id={`${id}-label`}
        className="text-[10px] font-black uppercase tracking-[0.2em] text-text/35"
      >
        Prove you are human..
      </p>
      <div className={cn(disabled ? 'opacity-70' : '')}>
        <div ref={wrapperRef} className="relative w-full">
          {isLoadingState && (
            <div className="mb-2 flex h-8 items-center gap-2 text-xs text-text/55">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading CAPTCHA...</span>
            </div>
          )}
          <div
            style={{
              height: `${Math.round(RECAPTCHA_HEIGHT * widgetScale)}px`,
            }}
          >
            <div
              className="origin-top-left mx-auto"
              style={{
                width: `${RECAPTCHA_WIDTH}px`,
                transform: `scale(${widgetScale})`,
              }}
            >
              <ReCAPTCHA
                key={resolvedTheme}
                ref={recaptchaRef}
                sitekey={siteKey}
                theme={resolvedTheme}
                onChange={handleChange}
                onExpired={onExpired}
                onErrored={handleWidgetError}
                asyncScriptOnLoad={handleScriptLoad}
              />
            </div>
          </div>
        </div>
      </div>
      {statusText && (
        <p
          id={`${id}-status`}
          className={cn(
            'text-xs',
            isCompleted || status === 'verified'
              ? 'text-emerald-400'
              : hasErrorState || status === 'expired'
                ? 'text-red-400'
                : 'text-text/65',
          )}
          role="status"
          aria-live="polite"
        >
          {isCompleted || status === 'verified' ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {statusText}
            </span>
          ) : hasErrorState || status === 'expired' ? (
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {statusText}
            </span>
          ) : isLoadingState ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {statusText}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              {statusText}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
