import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface AntiScreenshotShieldOptions {
  isTabSwitchShieldEnabled?: boolean;
  isPrintBlockingEnabled?: boolean;
  isViewingSensitiveMedia?: boolean;
  onShieldChange?: (isShielded: boolean) => void;
  customShieldMessage?: string;
}

export interface AntiScreenshotShieldState {
  isShieldActive: boolean;
  isPrintBlocked: boolean;
  shieldReason: 'tab-hidden' | 'window-blurred' | 'print-attempt' | 'screenshot-attempt' | null;
  deactivateShield: () => void;
  triggerManualShield: (durationMs?: number) => void;
}

/**
 * useAntiScreenshotAndShield
 * Hook to protect media and sensitive screens from:
 * 1. Printing (Ctrl+P, window.print, browser print menus)
 * 2. Tab/App switcher previews (visibilitychange, blur)
 * 3. Screenshots (PrintScreen key captures)
 */
export const useAntiScreenshotAndShield = ({
  isTabSwitchShieldEnabled = true,
  isPrintBlockingEnabled = true,
  isViewingSensitiveMedia = true,
  onShieldChange,
  customShieldMessage,
}: AntiScreenshotShieldOptions = {}): AntiScreenshotShieldState => {
  const [isShieldActive, setIsShieldActive] = useState(false);
  const [isPrintBlocked, setIsPrintBlocked] = useState(false);
  const [shieldReason, setShieldReason] = useState<AntiScreenshotShieldState['shieldReason']>(null);

  const shieldChangeCallbackRef = useRef(onShieldChange);
  shieldChangeCallbackRef.current = onShieldChange;

  const setShieldState = useCallback(
    (active: boolean, reason: AntiScreenshotShieldState['shieldReason'] = null) => {
      setIsShieldActive(active);
      setShieldReason(active ? reason : null);
      shieldChangeCallbackRef.current?.(active);
    },
    []
  );

  const deactivateShield = useCallback(() => {
    setShieldState(false, null);
  }, [setShieldState]);

  const triggerManualShield = useCallback(
    (durationMs = 2000) => {
      setShieldState(true, 'screenshot-attempt');
      if (durationMs > 0) {
        setTimeout(() => {
          setShieldState(false, null);
        }, durationMs);
      }
    },
    [setShieldState]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // 1. Tab Switch & OS Multitasking Preview Auto-Shield
    const handleVisibilityChange = () => {
      if (!isTabSwitchShieldEnabled || !isViewingSensitiveMedia) return;

      if (document.visibilityState === 'hidden') {
        setShieldState(true, 'tab-hidden');
      } else if (document.visibilityState === 'visible') {
        // Quick unlock when returning
        setShieldState(false, null);
      }
    };

    const handleWindowBlur = () => {
      if (!isTabSwitchShieldEnabled || !isViewingSensitiveMedia) return;
      setShieldState(true, 'window-blurred');
    };

    const handleWindowFocus = () => {
      setShieldState(false, null);
    };

    // 2. Print Interception Handlers
    const handleBeforePrint = () => {
      if (!isPrintBlockingEnabled || !isViewingSensitiveMedia) return;
      setIsPrintBlocked(true);
      setShieldState(true, 'print-attempt');
    };

    const handleAfterPrint = () => {
      setIsPrintBlocked(false);
      setShieldState(false, null);
    };

    // 3. Keyboard Shortcut Interception (Ctrl+P, Cmd+P, PrintScreen)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isViewingSensitiveMedia) return;

      // Intercept Ctrl+P / Cmd+P (Print & Save as PDF)
      if (isPrintBlockingEnabled && (e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        setShieldState(true, 'print-attempt');
        toast.error(
          customShieldMessage ||
            '⚠️ Printing and PDF export are blocked for protected vault media.',
          {
            duration: 3500,
          }
        );
        setTimeout(() => {
          setShieldState(false, null);
        }, 1200);
        return;
      }

      // Intercept PrintScreen key
      if (isPrintBlockingEnabled && (e.key === 'PrintScreen' || e.keyCode === 44)) {
        setShieldState(true, 'screenshot-attempt');
        toast.info('🛡️ Security Shield activated against screen capture.', {
          duration: 2500,
        });
        setTimeout(() => {
          setShieldState(false, null);
        }, 1500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    isTabSwitchShieldEnabled,
    isPrintBlockingEnabled,
    isViewingSensitiveMedia,
    customShieldMessage,
    setShieldState,
  ]);

  return {
    isShieldActive,
    isPrintBlocked,
    shieldReason,
    deactivateShield,
    triggerManualShield,
  };
};
