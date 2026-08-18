import express from 'express';

const normalizeRawIpAddress = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  let normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'unknown') {
    return undefined;
  }

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith('[') && normalized.includes(']')) {
    normalized = normalized.slice(1, normalized.indexOf(']'));
  }

  normalized = normalized.replace(/^for=/i, '').trim();
  normalized = normalized.replace(/^::ffff:/i, '').trim();

  return normalized || undefined;
};

const normalizeIpAddress = (value?: string | null): string | undefined => {
  const normalized = normalizeRawIpAddress(value);

  if (!normalized || normalized === '::1' || normalized === '127.0.0.1') {
    return undefined;
  }

  return normalized;
};

const parseForwardedHeader = (headerValue?: string): string | undefined => {
  if (!headerValue) {
    return undefined;
  }

  for (const segment of headerValue.split(',')) {
    for (const token of segment.split(';')) {
      const trimmed = token.trim();
      if (!trimmed.toLowerCase().startsWith('for=')) {
        continue;
      }

      const candidate = normalizeIpAddress(trimmed);
      if (candidate) {
        return candidate;
      }
    }
  }

  return undefined;
};

const parseForwardedForHeader = (headerValue?: string): string | undefined => {
  if (!headerValue) {
    return undefined;
  }

  for (const part of headerValue.split(',')) {
    const candidate = normalizeIpAddress(part);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

export const getClientIp = (req: express.Request): string => {
  const trustProxy = req.app.get('trust proxy');

  if (trustProxy) {
    const forwardedFor = req.get('x-forwarded-for');
    const fromForwardedFor = parseForwardedForHeader(forwardedFor);
    if (fromForwardedFor) {
      return fromForwardedFor;
    }

    const forwarded = req.get('forwarded');
    const fromForwarded = parseForwardedHeader(forwarded);
    if (fromForwarded) {
      return fromForwarded;
    }
  }

  const directIp =
    normalizeIpAddress(req.ip) ??
    normalizeIpAddress(req.socket?.remoteAddress) ??
    normalizeIpAddress(req.connection?.remoteAddress);

  const fallbackIp =
    normalizeRawIpAddress(req.ip) ??
    normalizeRawIpAddress(req.socket?.remoteAddress) ??
    normalizeRawIpAddress(req.connection?.remoteAddress);

  return directIp || fallbackIp || 'unknown';
};
