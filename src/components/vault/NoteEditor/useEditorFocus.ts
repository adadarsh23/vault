import { useCallback } from 'react';
import type React from 'react';

export const useEditorFocus = (textareaRef: React.RefObject<HTMLTextAreaElement | null>) =>
  useCallback(
    (start: number, end = start) => {
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const preservedScrollTop = textarea.scrollTop;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(start, end);
        textarea.scrollTop = preservedScrollTop;
      });
    },
    [textareaRef],
  );
