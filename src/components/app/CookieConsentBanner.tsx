import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { deleteCookie, getCookie, setCookie } from '../../lib/cookie-utils';

const COOKIE_CONSENT_KEY = 'vault_cookie_consent';
const COOKIE_SUPPORT_TEST_KEY = 'vault_cookie_support_test';

type CookieConsentState = 'accepted' | 'rejected' | null;

const readCookieConsentState = (): CookieConsentState => {
  const value = getCookie(COOKIE_CONSENT_KEY);
  if (value === 'accepted' || value === 'rejected') {
    return value;
  }
  return null;
};

const checkCookieSupport = (): boolean => {
  const ok = setCookie(COOKIE_SUPPORT_TEST_KEY, '1', { maxAge: 30 });
  if (!ok) {
    return false;
  }

  const value = getCookie(COOKIE_SUPPORT_TEST_KEY);
  deleteCookie(COOKIE_SUPPORT_TEST_KEY);
  return value === '1';
};

export const CookieConsentBanner = () => {
  const [consentState, setConsentState] = useState<CookieConsentState>(() =>
    readCookieConsentState(),
  );
  const [cookieSupported] = useState<boolean>(() => checkCookieSupport());

  const showBanner = consentState === null;

  const handleAccept = useCallback(() => {
    setCookie(COOKIE_CONSENT_KEY, 'accepted', {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'Lax',
      path: '/',
    });
    setConsentState('accepted');
  }, []);

  const handleReject = useCallback(() => {
    setCookie(COOKIE_CONSENT_KEY, 'rejected', {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'Strict',
      path: '/',
    });
    setConsentState('rejected');
  }, []);

  const statusLabel = useMemo(() => {
    if (!cookieSupported) {
      return 'Cookies unavailable in this browser/session.';
    }
    if (consentState === 'accepted') {
      return 'Cookie status: accepted.';
    }
    if (consentState === 'rejected') {
      return 'Cookie status: rejected.';
    }
    return 'Cookie status: not selected.';
  }, [consentState, cookieSupported]);

  if (!showBanner) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-4 right-4 z-[70]"
      >
        <div className="group relative overflow-hidden rounded-full border border-card-border/70 bg-card/95 px-3 py-2 text-[11px] text-text/80 shadow-xl backdrop-blur-xl">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-text/10 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
          <span className="relative inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {statusLabel}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.section
        key="cookie-consent-widget"
        initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 12, scale: 0.96, filter: 'blur(6px)' }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-4 right-4 z-[70] w-[min(90vw,320px)] overflow-hidden rounded-2xl border border-card-border/80 bg-card/95 p-3.5 shadow-2xl backdrop-blur-xl"
      >
        <motion.div
          initial={{ x: '-120%' }}
          animate={{ x: '120%' }}
          transition={{ duration: 1.4, ease: 'linear', repeat: Infinity, repeatDelay: 2.2 }}
          className="pointer-events-none absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-text/10 to-transparent"
        />

        <p className="relative text-xs font-semibold uppercase tracking-wide text-text/75">
          Cookie Preferences
        </p>
        <p className="relative mt-1 text-xs text-text/70 leading-relaxed">
          {cookieSupported
            ? 'Secure cookies keep your session protected.'
            : 'Cookies are unavailable in this environment.'}
        </p>
        <p className="relative mt-2 text-[11px] text-text/80">{statusLabel}</p>

        <div className="relative mt-3 flex items-center gap-2">
          <Button size="sm" className="h-8 px-3 text-[11px]" onClick={handleAccept}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-[11px]"
            onClick={handleReject}
          >
            Reject
          </Button>
        </div>
      </motion.section>
    </AnimatePresence>
  );
};
