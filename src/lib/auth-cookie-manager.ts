import { type CookieOptions, deleteCookie, getCookie, hasCookie, setCookie } from './cookie-utils';

export const AUTH_COOKIE_NAMES = {
  rememberMe: 'vault_remember_me',
} as const;

export interface AuthCookieState {
  rememberMe: boolean;
}

export interface PersistAuthCookieInput {
  rememberMe?: boolean;
  expiresAt?: Date;
  maxAgeSeconds?: number;
}

const AUTH_COOKIE_BASE: CookieOptions = {
  path: '/',
  sameSite: 'Lax',
  secure: import.meta.env.PROD,
};

const createCookieOptions = (
  input: Pick<PersistAuthCookieInput, 'expiresAt' | 'maxAgeSeconds'>,
): CookieOptions => ({
  ...AUTH_COOKIE_BASE,
  expires: input.expiresAt,
  maxAge: input.maxAgeSeconds,
});

const toBooleanCookie = (value: boolean): '1' | '0' => (value ? '1' : '0');

const readBooleanCookie = (value: string | null): boolean => value === '1';

/**
 * Persists frontend-readable auth cookies.
 * Note: Refresh token cookies should ideally be HttpOnly and set by backend.
 */
export const persistAuthCookies = (input: PersistAuthCookieInput) => {
  const options = createCookieOptions(input);

  if (typeof input.rememberMe === 'boolean') {
    setCookie(AUTH_COOKIE_NAMES.rememberMe, toBooleanCookie(input.rememberMe), {
      ...options,
      sameSite: 'Strict',
    });
  }
};

export const clearAuthCookies = () => {
  deleteCookie(AUTH_COOKIE_NAMES.rememberMe, AUTH_COOKIE_BASE);
};

export const readAuthCookies = (): AuthCookieState => ({
  rememberMe: readBooleanCookie(getCookie(AUTH_COOKIE_NAMES.rememberMe)),
});

export const hasAnyAuthCookie = (): boolean => hasCookie(AUTH_COOKIE_NAMES.rememberMe);

export const deleteExpiredAuthCookies = () => {
  const authCookies = readAuthCookies();
  if (!authCookies.rememberMe) {
    deleteCookie(AUTH_COOKIE_NAMES.rememberMe, AUTH_COOKIE_BASE);
  }
};
