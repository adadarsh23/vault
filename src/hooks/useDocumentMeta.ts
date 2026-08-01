import { useEffect } from 'react';
import { logger } from '../lib/logger';

type MetaConfig = {
  title: string;
  description: string;
  path?: string;
};

const upsertMetaContent = (
  selector: string,
  identifier: { type: 'name' | 'property'; value: string },
  content: string
) => {
  const root = document.head || document.documentElement;
  if (!root) return;

  let element = document.querySelector(selector);
  if (!(element instanceof HTMLMetaElement)) {
    const created = document.createElement('meta');
    created.setAttribute(identifier.type, identifier.value);
    root.appendChild(created);
    element = created;
  }

  element.setAttribute('content', content);
};

const upsertCanonicalLink = (url: string) => {
  const root = document.head || document.documentElement;
  if (!root) return;

  let element = document.querySelector('link[rel="canonical"]');
  if (!(element instanceof HTMLLinkElement)) {
    const created = document.createElement('link');
    created.setAttribute('rel', 'canonical');
    root.appendChild(created);
    element = created;
  }

  element.setAttribute('href', url);
};

const toCanonicalUrl = (path: string): string | null => {
  if (typeof window === 'undefined') return null;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  try {
    return new URL(normalizedPath, window.location.origin).toString();
  } catch (error) {
    logger.warn('Failed to resolve canonical URL for metadata', {
      path: normalizedPath,
      error,
    });
    return null;
  }
};

export const useDocumentMeta = ({ title, description, path = '/' }: MetaConfig) => {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    document.title = title;

    upsertMetaContent(
      'meta[name="description"]',
      { type: 'name', value: 'description' },
      description
    );
    upsertMetaContent('meta[property="og:title"]', { type: 'property', value: 'og:title' }, title);
    upsertMetaContent(
      'meta[property="og:description"]',
      { type: 'property', value: 'og:description' },
      description
    );
    upsertMetaContent(
      'meta[name="twitter:title"]',
      { type: 'name', value: 'twitter:title' },
      title
    );
    upsertMetaContent(
      'meta[name="twitter:description"]',
      { type: 'name', value: 'twitter:description' },
      description
    );

    const canonicalUrl = toCanonicalUrl(path);
    if (!canonicalUrl) return;

    upsertMetaContent(
      'meta[property="og:url"]',
      { type: 'property', value: 'og:url' },
      canonicalUrl
    );
    upsertMetaContent(
      'meta[name="twitter:url"]',
      { type: 'name', value: 'twitter:url' },
      canonicalUrl
    );
    upsertCanonicalLink(canonicalUrl);
  }, [description, path, title]);
};
