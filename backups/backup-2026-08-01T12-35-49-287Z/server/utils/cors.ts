const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
  ];

  return sources
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
};

export const isAllowedCorsOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.trim().replace(/\/+$/, "");
  const configuredOrigins = getAllowedCorsOrigins();
  const allowLocalCorsInProd =
    process.env.ALLOW_LOCAL_CORS_ORIGINS === "1" ||
    process.env.ALLOW_LOCAL_CORS_ORIGINS?.toLowerCase() === "true";

  if (configuredOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    const { hostname } = new URL(normalizedOrigin);
    if (isPrivateNetworkHost(hostname)) {
      if (process.env.NODE_ENV === "production" && !allowLocalCorsInProd) {
        return false;
      }
      return true;
    }
  } catch {
    // Treat invalid URLs as non-allowed
  }

  if (process.env.NODE_ENV === "production" && !allowLocalCorsInProd) {
    return false;
  }

  return false;
};
