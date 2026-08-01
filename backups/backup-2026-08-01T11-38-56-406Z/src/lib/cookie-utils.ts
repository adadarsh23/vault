export type SameSitePolicy = 'Strict' | 'Lax' | 'None'

export interface CookieOptions {
  expires?: Date
  maxAge?: number
  path?: string
  domain?: string
  secure?: boolean
  sameSite?: SameSitePolicy
  httpOnly?: boolean
}

export interface CookieRecord {
  name: string
  value: string
}

const COOKIE_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

let cachedCookieString = ''
let cachedCookieMap = new Map<string, string>()

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined'

const shouldUseSecureCookies = (): boolean => {
  if (!isBrowser()) {
    return false
  }

  if (window.location.protocol === 'https:') {
    return true
  }

  return Boolean(import.meta.env.PROD)
}

const sanitizeCookieValue = (value: string): string =>
  encodeURIComponent(value).replace(/[\r\n]/g, '')

const parseCookies = (cookieString: string): Map<string, string> => {
  const map = new Map<string, string>()

  if (!cookieString) {
    return map
  }

  const pairs = cookieString.split(';')

  for (const pair of pairs) {
    const trimmed = pair.trim()
    if (!trimmed) {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index < 0) {
      continue
    }

    const rawName = trimmed.slice(0, index).trim()
    const rawValue = trimmed.slice(index + 1)

    if (!COOKIE_NAME_PATTERN.test(rawName)) {
      continue
    }

    try {
      map.set(rawName, decodeURIComponent(rawValue))
    } catch {
      // Invalid encoded values are ignored for safety.
    }
  }

  return map
}

const getCookieMap = (): Map<string, string> => {
  if (!isBrowser()) {
    return new Map()
  }

  const nextCookieString = document.cookie || ''
  if (nextCookieString === cachedCookieString) {
    return cachedCookieMap
  }

  cachedCookieString = nextCookieString
  cachedCookieMap = parseCookies(nextCookieString)
  return cachedCookieMap
}

const invalidateCookieCache = () => {
  cachedCookieString = ''
  cachedCookieMap = new Map()
}

const normalizeOptions = (options?: CookieOptions): CookieOptions => {
  const secure = options?.secure ?? shouldUseSecureCookies()
  const sameSite = options?.sameSite ?? 'Lax'

  return {
    path: options?.path ?? '/',
    domain: options?.domain,
    expires: options?.expires,
    maxAge: options?.maxAge,
    secure,
    sameSite,
    httpOnly: options?.httpOnly,
  }
}

const buildCookieString = (
  name: string,
  value: string,
  options?: CookieOptions,
): string => {
  const resolved = normalizeOptions(options)

  const attributes: string[] = [
    `${name}=${sanitizeCookieValue(value)}`,
    `Path=${resolved.path || '/'}`,
    `SameSite=${resolved.sameSite || 'Lax'}`,
  ]

  if (resolved.maxAge !== undefined) {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(resolved.maxAge))}`)
  }

  if (resolved.expires) {
    attributes.push(`Expires=${resolved.expires.toUTCString()}`)
  }

  if (resolved.domain) {
    attributes.push(`Domain=${resolved.domain}`)
  }

  if (resolved.secure) {
    attributes.push('Secure')
  }

  if (resolved.httpOnly) {
    // Browsers do not allow setting HttpOnly from JavaScript.
    // This flag is preserved as intent-awareness for callers.
    if (import.meta.env.DEV) {
      console.warn(
        `Cookie "${name}" requested httpOnly from frontend; this must be set by the backend Set-Cookie header.`,
      )
    }
  }

  return attributes.join('; ')
}

export const setCookie = (
  name: string,
  value: string,
  options?: CookieOptions,
): boolean => {
  if (!isBrowser()) {
    return false
  }

  const normalizedName = name.trim()
  if (!COOKIE_NAME_PATTERN.test(normalizedName)) {
    return false
  }

  document.cookie = buildCookieString(normalizedName, value, options)
  invalidateCookieCache()
  return true
}

export const getCookie = (name: string): string | null => {
  const normalizedName = name.trim()
  if (!normalizedName) {
    return null
  }

  const cookieMap = getCookieMap()
  return cookieMap.get(normalizedName) ?? null
}

export const hasCookie = (name: string): boolean => getCookie(name) !== null

export const deleteCookie = (name: string, options?: CookieOptions): boolean =>
  setCookie(name, '', {
    ...options,
    expires: new Date(0),
    maxAge: 0,
  })

export const updateCookie = (
  name: string,
  value: string,
  options?: CookieOptions,
): boolean => {
  if (!hasCookie(name)) {
    return false
  }

  return setCookie(name, value, options)
}

export const readAllCookies = (): CookieRecord[] =>
  Array.from(getCookieMap().entries()).map(([name, value]) => ({ name, value }))

export const isClientCookieEnvironment = isBrowser