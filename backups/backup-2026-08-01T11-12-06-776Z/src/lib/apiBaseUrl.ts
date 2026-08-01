const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '')
const readHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}
const isPrivateNetworkHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)

export const resolveApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location
    const isDev = import.meta.env.DEV
    const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
    const envBaseHost = envBaseUrl ? readHostname(envBaseUrl) : null
    const envBaseOrigin = (() => {
      if (!envBaseUrl) {
        return null
      }
      try {
        return new URL(envBaseUrl).origin
      } catch {
        return null
      }
    })()

    // In local dev, prefer same-origin so whichever port currently serves
    // the app also receives API requests (including auto-fallback ports).
    if (isDev && isPrivateNetworkHost(hostname)) {
      return normalizeBaseUrl(origin)
    }

    // In development on non-local hosts, allow explicit API override.
    const devBaseUrl = import.meta.env.VITE_DEV_API_BASE_URL?.trim()
    if (isDev && devBaseUrl) {
      return normalizeBaseUrl(devBaseUrl)
    }

    // In local/private-host browser sessions, keep API calls same-origin unless
    // VITE_API_BASE_URL points to a non-local host explicitly.
    if (
      isPrivateNetworkHost(hostname) &&
      (!envBaseHost || isPrivateNetworkHost(envBaseHost))
    ) {
      // If an explicit local API origin is configured and differs from the UI
      // origin (for example: preview on :4173 with API on :4000), honor it.
      if (envBaseUrl && envBaseOrigin && envBaseOrigin !== origin) {
        return normalizeBaseUrl(envBaseUrl)
      }
      return normalizeBaseUrl(origin)
    }

    // For non-dev browser builds, prefer explicit API base URL.
    if (envBaseUrl) {
      return normalizeBaseUrl(envBaseUrl)
    }

    return normalizeBaseUrl(origin)
  }

  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl)
  }

  const devBaseUrl = import.meta.env.VITE_DEV_API_BASE_URL?.trim()
  if (devBaseUrl && import.meta.env.DEV) {
    return normalizeBaseUrl(devBaseUrl)
  }

  const defaultBaseUrl = import.meta.env.VITE_DEFAULT_API_BASE_URL?.trim()
  if (defaultBaseUrl) {
    return normalizeBaseUrl(defaultBaseUrl)
  }

  return 'http://127.0.0.1:4000'
}
