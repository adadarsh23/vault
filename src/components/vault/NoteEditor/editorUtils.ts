import type React from 'react';

export const TASK_LINE_REGEX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[(?: |x|X)\](.*)$/;

export const updateScrollVisibility = (
  ref: React.RefObject<HTMLElement | null>,
  topSetter: (show: boolean) => void,
  bottomSetter?: (show: boolean) => void
) => {
  if (ref.current) {
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    topSetter(scrollTop > 200);
    if (bottomSetter) {
      bottomSetter(scrollHeight - scrollTop - clientHeight > 200);
    }
  }
};

export const scrollToTop = (ref: React.RefObject<HTMLElement | null>) => {
  ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
};

export const scrollToBottom = (ref: React.RefObject<HTMLElement | null>) => {
  ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
};

export const normalizeExternalUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
};
