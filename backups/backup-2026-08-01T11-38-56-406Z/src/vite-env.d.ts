/// <reference types="vite/client" />

type EnvBoolean = 'true' | 'false'
type EnvNumber = `${number}`

interface ImportMetaEnv {
  // App URLs / networking
  readonly VITE_APP_PUBLIC_URL?: string
  readonly VITE_DNS_PREFETCH_HOST?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_API_BASE_URL?: string
  readonly VITE_DEFAULT_API_BASE_URL?: string
  readonly VITE_CSP_CONNECT_SRC?: string

  // Analytics / observability
  readonly VITE_GA_ID?: string
  readonly VITE_LOGROCKET_APP_ID: string
  readonly VITE_LOGROCKET_ALLOW_LOCALHOST?: EnvBoolean
  readonly VITE_RECAPTCHA_SITE_KEY?: string

  // File limits
  readonly VITE_MAX_FILE_SIZE_MB?: EnvNumber

  // Release metadata
  readonly VITE_APP_RELEASE?: string

  // Frontend Sentry
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENABLED?: EnvBoolean
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_SENTRY_RELEASE?: string
  readonly VITE_SENTRY_ENABLE_LOCALHOST?: EnvBoolean
  readonly VITE_SENTRY_REPLAY_ENABLED?: EnvBoolean
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: EnvNumber
  readonly VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE?: EnvNumber
  readonly VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE?: EnvNumber
  readonly VITE_SENTRY_SOURCEMAPS?: EnvBoolean

  // Build-time toggles (optional for client typing consistency)
  readonly VITE_BUILD_SOURCEMAP?: EnvBoolean | 'inline' | 'hidden'
  readonly VITE_BUILD_MINIFY?: 'oxc' | 'terser' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
