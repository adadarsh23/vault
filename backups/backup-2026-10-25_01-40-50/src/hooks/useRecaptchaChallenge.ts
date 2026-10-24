import { useCallback, useState, useMemo } from 'react';

export type RecaptchaStatus = 'idle' | 'verified' | 'expired' | 'error';

interface RecaptchaFeedback {
  status: RecaptchaStatus;
  message: string | null;
}

const DEFAULT_FEEDBACK: RecaptchaFeedback = {
  status: 'idle',
  message: null,
};

export const useRecaptchaChallenge = () => {
  const [token, setToken] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [feedback, setFeedback] = useState<RecaptchaFeedback>(DEFAULT_FEEDBACK);

  const handleTokenChange = useCallback((nextToken: string | null) => {
    const normalized = typeof nextToken === 'string' ? nextToken.trim() : nextToken;
    if (!normalized) {
      setToken(null);
      setFeedback(DEFAULT_FEEDBACK);
      return;
    }

    setToken(normalized);
    setFeedback({
      status: 'verified',
      message: null,
    });
  }, []);

  const handleExpired = useCallback(() => {
    setToken(null);
    setFeedback({
      status: 'expired',
      message: 'CAPTCHA expired. Please complete it again.',
    });
  }, []);

  const handleError = useCallback(() => {
    setToken(null);
    setFeedback({
      status: 'error',
      message:
        'CAPTCHA failed to load. Verify you are using a reCAPTCHA v2 Checkbox site key, then refresh and try again.',
    });
  }, []);

  const resetChallenge = useCallback((message?: string) => {
    setToken(null);
    setFeedback({
      status: 'idle',
      message: message ?? null,
    });
    setResetNonce((current) => current + 1);
  }, []);

  const setRejected = useCallback((message: string) => {
    setToken(null);
    setFeedback({
      status: 'error',
      message,
    });
    setResetNonce((current) => current + 1);
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback(DEFAULT_FEEDBACK);
  }, []);

  return useMemo(
    () => ({
      token,
      isCompleted: Boolean(token),
      resetNonce,
      feedback,
      handleTokenChange,
      handleExpired,
      handleError,
      resetChallenge,
      setRejected,
      clearFeedback,
    }),
    [
      clearFeedback,
      feedback,
      handleError,
      handleExpired,
      handleTokenChange,
      resetChallenge,
      resetNonce,
      setRejected,
      token,
    ],
  );
};
