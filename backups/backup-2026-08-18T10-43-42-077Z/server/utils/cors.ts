const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isPrivateNetworkHost = (hostname: string): boolean => {
  if (LOCAL_HOSTS.has(hostname)) {
    return true;
  }

  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
};

export const getAllowedCorsOrigins = (): string[] => {
  const sources = [
    process.env.CLIENT_URL,
    process.env.PUBLIC_URL,
    process.env.VITE_APP_PUBLIC_URL,
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.RENDER_EXTERNAL_URL,
  ];

  const origins = sources
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (!IS_PRODUCTION) {
    origins.push(
      'http://localhost:4000',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:4000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    );
  }

  return [...new Set(origins)];
};

export const isAllowedCorsOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.trim().replace(/\/+$/, '');
  const configuredOrigins = getAllowedCorsOrigins();

  if (configuredOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // Non-production convenience overrides
  if (!IS_PRODUCTION) {
    if (configuredOrigins.includes('*') || process.env.ALLOW_ALL_CORS === 'true') {
      return true;
    }

    try {
      const { hostname } = new URL(normalizedOrigin);
      if (isPrivateNetworkHost(hostname)) {
        return true;
      }
    } catch {
      // Treat invalid URLs as non-allowed
    }
  }

  return false;
};
