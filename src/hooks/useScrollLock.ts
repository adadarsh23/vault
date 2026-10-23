import { useEffect, useLayoutEffect } from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

let activeLocks = 0;
let scrollY = 0;
let originalBodyStyles: Partial<CSSStyleDeclaration> = {};
let originalHtmlOverflow = '';

const lockDocumentScroll = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return;

  const { body, documentElement } = document;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

  scrollY = window.scrollY;
  originalHtmlOverflow = documentElement.style.overflow;
  originalBodyStyles = {
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
  };

  documentElement.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.width = '100%';

  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
};

const unlockDocumentScroll = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return;

  const { body, documentElement } = document;

  documentElement.style.overflow = originalHtmlOverflow;
  body.style.overflow =
    originalBodyStyles.overflow !== undefined ? originalBodyStyles.overflow : '';
  body.style.paddingRight =
    originalBodyStyles.paddingRight !== undefined ? originalBodyStyles.paddingRight : '';
  body.style.position =
    originalBodyStyles.position !== undefined ? originalBodyStyles.position : '';
  body.style.top = originalBodyStyles.top !== undefined ? originalBodyStyles.top : '';
  body.style.width = originalBodyStyles.width !== undefined ? originalBodyStyles.width : '';

  try {
    window.scrollTo({ left: 0, top: scrollY, behavior: 'instant' as ScrollBehavior });
  } catch {
    window.scrollTo(0, scrollY);
  }

  originalBodyStyles = {};
  originalHtmlOverflow = '';
  scrollY = 0;
};

export const useScrollLock = (locked: boolean) => {
  useIsomorphicLayoutEffect(() => {
    if (!locked || typeof window === 'undefined') return;

    if (activeLocks === 0) {
      lockDocumentScroll();
    }

    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);

      if (activeLocks === 0) {
        unlockDocumentScroll();
      }
    };
  }, [locked]);
};
