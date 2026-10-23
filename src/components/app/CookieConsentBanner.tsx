import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { deleteCookie, getCookie, setCookie } from '../../lib/cookie-utils';
import { Check, X } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'vault_cookie_consent';
const COOKIE_SUPPORT_TEST_KEY = 'vault_cookie_support_test';

type CookieConsentState = 'accepted' | 'rejected' | null;

const readCookieConsentState = (): CookieConsentState => {
  try {
    const value = getCookie(COOKIE_CONSENT_KEY);
    if (value === 'accepted' || value === 'rejected') {
      return value;
    }
  } catch {
    // Cookie reading blocked by browser settings
  }
  return null;
};

const checkCookieSupport = (): boolean => {
  try {
    const ok = setCookie(COOKIE_SUPPORT_TEST_KEY, '1', { maxAge: 30 });
    if (!ok) {
      return false;
    }

    const value = getCookie(COOKIE_SUPPORT_TEST_KEY);
    deleteCookie(COOKIE_SUPPORT_TEST_KEY);
    return value === '1';
  } catch {
    return false;
  }
};

export const CookieConsentBanner = () => {
  const [consentState, setConsentState] = useState<CookieConsentState>(() =>
    readCookieConsentState(),
  );
  const [cookieSupported] = useState<boolean>(() => checkCookieSupport());
  const [showConfirmation, setShowConfirmation] = useState(false);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleReopen = () => {
      setConsentState(null);
      setShowConfirmation(false);
    };

    window.addEventListener('vault:open-cookie-preferences', handleReopen);

    return () => {
      window.removeEventListener('vault:open-cookie-preferences', handleReopen);
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }
    };
  }, []);

  const handleAccept = useCallback(() => {
    try {
      setCookie(COOKIE_CONSENT_KEY, 'accepted', {
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'Lax',
        path: '/',
      });
    } catch {
      // Ignored if cookie setting is blocked
    }
    setConsentState('accepted');
    setShowConfirmation(true);
    confirmationTimerRef.current = setTimeout(() => {
      setShowConfirmation(false);
    }, 3500);
  }, []);

  const handleReject = useCallback(() => {
    try {
      setCookie(COOKIE_CONSENT_KEY, 'rejected', {
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'Strict',
        path: '/',
      });
    } catch {
      // Ignored if cookie setting is blocked
    }
    setConsentState('rejected');
    setShowConfirmation(true);
    confirmationTimerRef.current = setTimeout(() => {
      setShowConfirmation(false);
    }, 3500);
  }, []);

  const statusLabel = useMemo(() => {
    if (!cookieSupported) {
      return 'Cookies unavailable in this browser session';
    }
    if (consentState === 'accepted') {
      return 'Preferences saved: Cookies accepted';
    }
    if (consentState === 'rejected') {
      return 'Preferences saved: Cookies rejected';
    }
    return 'Cookie preferences';
  }, [consentState, cookieSupported]);

  // Show temporary confirmation toast after choice, then auto-dismiss completely to avoid blocking UI
  if (consentState !== null) {
    return (
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            key="cookie-confirmation"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-4 right-4 z-[70] max-w-[calc(100vw-2rem)] select-none"
          >
            <div className="flex items-center gap-2.5 rounded-full border border-card-border/80 bg-card/95 px-3.5 py-2 text-xs font-medium text-text shadow-xl backdrop-blur-xl">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="h-3 w-3" />
              </span>
              <span>{statusLabel}</span>
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="ml-1 p-0.5 text-text/50 hover:text-text rounded-full transition-colors"
                aria-label="Dismiss cookie notice"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key="cookie-consent-widget"
        role="region"
        aria-label="Cookie Preferences"
        initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 12, scale: 0.96, filter: 'blur(6px)' }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-4 right-4 z-[70] w-[min(calc(100vw-2rem),340px)] overflow-hidden rounded-2xl border border-card-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-text/80">
            Cookie Preferences
          </p>
          <button
            type="button"
            onClick={handleReject}
            className="rounded-lg p-1 text-text/40 hover:text-text hover:bg-text/10 transition-colors"
            aria-label="Close and reject non-essential cookies"
            title="Reject & Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-1.5 text-xs text-text/70 leading-relaxed">
          {cookieSupported
            ? 'We use essential cookies to maintain secure sessions and preserve end-to-end encryption states.'
            : 'Cookies are currently unavailable in this browser session. Some persistent features may be limited.'}
        </p>

        <div className="mt-3.5 flex items-center gap-2">
          <Button size="sm" className="h-8 flex-1 text-xs font-medium" onClick={handleAccept}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 text-xs font-medium"
            onClick={handleReject}
          >
            Reject
          </Button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};
