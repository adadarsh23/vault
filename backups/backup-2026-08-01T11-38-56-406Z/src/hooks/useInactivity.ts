import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { logActivity, getSessionName } from '../lib/activity';
import { logger } from '../lib/logger';

interface InactivityOptions {
  isUnlocked: boolean;
  isAutoLockEnabled: boolean;
  autoLockDuration: number; // in minutes
  isBlurOnTabHideEnabled: boolean;
  lock: () => void;
}

const INACTIVITY_BLUR_DELAY_MS = 30_000;
const DEFAULT_AUTO_LOCK_MINUTES = 5;
const MAX_AUTO_LOCK_MINUTES = 24 * 60;
const COUNTDOWN_THRESHOLD_SEC = 60;

const normalizeAutoLockDuration = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  return Math.min(Math.round(value), MAX_AUTO_LOCK_MINUTES);
};

/**
 * useInactivity
 * Manages auto-locking and UI blurring based on user activity and tab visibility.
 */
export const useInactivity = ({
  isUnlocked,
  isAutoLockEnabled,
  autoLockDuration,
  isBlurOnTabHideEnabled,
  lock,
}: InactivityOptions) => {
  const [isInactive, setIsInactive] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  
  const resetTimerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let inactivityTimeout: ReturnType<typeof setTimeout> | null = null;
    let lockTimeout: ReturnType<typeof setTimeout> | null = null;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;
    let isDisposed = false;
    let hasAutoLocked = false;
    let lockTime = 0;

    const clearTimers = () => {
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = null;
      }
      if (lockTimeout) {
        clearTimeout(lockTimeout);
        lockTimeout = null;
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };

    const runAutoLock = () => {
      if (isDisposed || hasAutoLocked) return;
      hasAutoLocked = true;

      try {
        lock();
        toast.info('Session expired. Vault is secure.');
        logActivity({
          actionType: 'auth_lock',
          itemName: getSessionName(),
          description: 'Auto-locked vault after inactivity',
          status: 'success',
        });
      } catch (error) {
        logger.error('Auto-lock action failed', { error });
        toast.error('Unable to auto-lock session. Please lock manually.');
      }
    };

    const updateCountdown = () => {
      if (isDisposed || hasAutoLocked) return;
      const remainingSec = Math.ceil((lockTime - Date.now()) / 1000);
      
      if (remainingSec <= 0) {
        setCountdownSeconds(0);
        runAutoLock();
      } else if (remainingSec <= COUNTDOWN_THRESHOLD_SEC) {
        setCountdownSeconds(remainingSec);
      } else {
        setCountdownSeconds(null);
      }
    };

    const resetTimer = () => {
      setIsInactive(false);
      setCountdownSeconds(null);
      hasAutoLocked = false;
      clearTimers();

      if (!isUnlocked) return;

      // Inactivity Blur
      inactivityTimeout = setTimeout(() => {
        setIsInactive(true);
      }, INACTIVITY_BLUR_DELAY_MS);

      // Actual Auto-Lock
      if (isAutoLockEnabled) {
        const normalizedDurationMinutes = normalizeAutoLockDuration(autoLockDuration);
        const lockDelayMs = normalizedDurationMinutes * 60 * 1000;
        lockTime = Date.now() + lockDelayMs;
        
        lockTimeout = setTimeout(() => {
          runAutoLock();
        }, lockDelayMs);

        // Start checking for countdown when we get close
        const timeUntilCountdown = lockDelayMs - (COUNTDOWN_THRESHOLD_SEC * 1000);
        if (timeUntilCountdown > 0) {
          setTimeout(() => {
            if (isDisposed || hasAutoLocked || lockTime < Date.now()) return;
            updateCountdown();
            countdownInterval = setInterval(updateCountdown, 1000);
          }, timeUntilCountdown);
        } else {
          // Duration is less than the threshold
          updateCountdown();
          countdownInterval = setInterval(updateCountdown, 1000);
        }
      }
    };

    resetTimerRef.current = resetTimer;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isBlurOnTabHideEnabled) {
        setIsInactive(true);
      } else if (document.visibilityState === 'visible') {
        resetTimer();
      }
    };

    if (!isUnlocked) {
      setIsInactive(false);
      setCountdownSeconds(null);
      return () => {
        isDisposed = true;
        clearTimers();
      };
    }

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'pointerdown'];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    resetTimer();

    return () => {
      isDisposed = true;
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimers();
    };
  }, [isUnlocked, lock, isAutoLockEnabled, autoLockDuration, isBlurOnTabHideEnabled]);

  const resetTimer = useCallback(() => {
    resetTimerRef.current();
  }, []);

  return { isInactive, setIsInactive, countdownSeconds, resetTimer };
};
