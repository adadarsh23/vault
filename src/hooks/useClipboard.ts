import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { toast } from 'sonner';
import { logger } from '../lib/logger';

const COPY_RESET_DELAY_MS = 2_000;
const MAX_AUTO_CLEAR_SECONDS = 60 * 10;

const fallbackCopyText = (text: string): boolean => {
  if (typeof document === 'undefined') return false;
  const { body } = document;
  if (!body) return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    logger.warn('Fallback clipboard copy failed', { error });
  } finally {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }

  return copied;
};

const writeClipboardText = async (text: string): Promise<boolean> => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      logger.warn('Clipboard API write failed; attempting fallback', { error });
    }
  }

  return fallbackCopyText(text);
};

export const useClipboard = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fast selector prevents re-rendering on unrelated vault store mutations
  const isClipboardAutoClearEnabled = useVaultStore(
    (state) => state.preferences.isClipboardAutoClearEnabled,
  );
  const clipboardAutoClearDuration = useVaultStore(
    (state) => state.preferences.clipboardAutoClearDuration,
  );

  const copiedIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoClearIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  const isMountedRef = useRef(true);

  const clearAutoClearTimers = useCallback(() => {
    if (autoClearTimeoutRef.current) {
      clearTimeout(autoClearTimeoutRef.current);
      autoClearTimeoutRef.current = null;
    }
    if (autoClearIntervalRef.current) {
      clearInterval(autoClearIntervalRef.current);
      autoClearIntervalRef.current = null;
    }
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copiedIndicatorTimeoutRef.current) {
        clearTimeout(copiedIndicatorTimeoutRef.current);
        copiedIndicatorTimeoutRef.current = null;
      }
      clearAutoClearTimers();
    };
  }, [clearAutoClearTimers]);

  const copy = useCallback(
    async (text: string, id: string): Promise<boolean> => {
      if (!text) {
        toast.error('Nothing to copy');
        return false;
      }

      const didCopy = await writeClipboardText(text);
      if (!didCopy) {
        toast.error('Failed to copy to clipboard');
        return false;
      }

      if (!isMountedRef.current) return true;
      setCopiedId(id);

      // Keep only the newest indicator timeout.
      if (copiedIndicatorTimeoutRef.current) {
        clearTimeout(copiedIndicatorTimeoutRef.current);
      }
      copiedIndicatorTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCopiedId(null);
        }
      }, COPY_RESET_DELAY_MS);

      if (!isClipboardAutoClearEnabled) {
        return true;
      }

      const normalizedSeconds = Number.isFinite(clipboardAutoClearDuration)
        ? Math.min(MAX_AUTO_CLEAR_SECONDS, Math.max(1, Math.round(clipboardAutoClearDuration)))
        : 30;

      clearAutoClearTimers();

      let secondsLeft = normalizedSeconds;
      const toastId = toast.info(`Clipboard will clear in ${secondsLeft}s`, {
        duration: normalizedSeconds * 1000,
      });
      toastIdRef.current = toastId;

      autoClearIntervalRef.current = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          if (autoClearIntervalRef.current) {
            clearInterval(autoClearIntervalRef.current);
            autoClearIntervalRef.current = null;
          }
        } else {
          toast.info(`Clipboard will clear in ${secondsLeft}s`, { id: toastId });
        }
      }, 1000);

      autoClearTimeoutRef.current = setTimeout(() => {
        void (async () => {
          if (autoClearIntervalRef.current) {
            clearInterval(autoClearIntervalRef.current);
            autoClearIntervalRef.current = null;
          }
          if (toastIdRef.current) {
            toast.dismiss(toastIdRef.current);
            toastIdRef.current = null;
          }
          if (!isMountedRef.current || typeof document === 'undefined') return;

          // Browsers can reject clipboard writes when backgrounded/unfocused.
          if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
            return;
          }

          const cleared = await writeClipboardText('');
          if (cleared && isMountedRef.current) {
            toast.success('Clipboard cleared for security');
          }
        })();
      }, normalizedSeconds * 1000);

      return true;
    },
    [isClipboardAutoClearEnabled, clipboardAutoClearDuration, clearAutoClearTimers],
  );

  return useMemo(
    () => ({
      copy,
      copiedId,
    }),
    [copy, copiedId],
  );
};
