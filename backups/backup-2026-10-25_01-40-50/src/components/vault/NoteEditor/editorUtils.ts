import type React from 'react';

export const TASK_LINE_REGEX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[(?: |x|X)\](.*)$/;

export const updateScrollVisibility = (
  ref: React.RefObject<HTMLElement | null>,
  topSetter: (show: boolean) => void,
  bottomSetter?: (show: boolean) => void,
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
  const el = ref.current;
  if (!el) return;
  try {
    el.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    el.scrollTop = 0;
  }
};

export const scrollToBottom = (ref: React.RefObject<HTMLElement | null>) => {
  const el = ref.current;
  if (!el) return;
  try {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  } catch {
    el.scrollTop = el.scrollHeight;
  }
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
