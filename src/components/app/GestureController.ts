import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';

type MobileGestureState = {
  mode: 'open' | 'close' | null;
  direction: 'undecided' | 'horizontal' | 'vertical';
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  sidebarWidth: number;
};

const MOBILE_BREAKPOINT_PX = 1024;
const MOBILE_SWIPE_EDGE_PX = 48;
const MOBILE_SWIPE_TRIGGER_PX = 60;
const MOBILE_SWIPE_VERTICAL_TOLERANCE_PX = 72;
const MOBILE_SWIPE_DIRECTION_BIAS_PX = 12;
const MOBILE_SWIPE_VELOCITY_THRESHOLD = 0.35;
const MOBILE_SWIPE_OPEN_RATIO = 0.32;
const MOBILE_SWIPE_CLOSE_RATIO = 0.24;
const MOBILE_SWIPE_OVERSHOOT_PX = 18;

const isClient = typeof window !== 'undefined';

const getMobileSidebarWidth = () => (isClient ? Math.min(window.innerWidth * 0.85, 280) : 280);

const createIdleGestureState = (): MobileGestureState => ({
  mode: null,
  direction: 'undecided',
  startX: 0,
  startY: 0,
  lastX: 0,
  lastTime: 0,
  velocityX: 0,
  sidebarWidth: 280,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface UseGestureControllerOptions {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  locationPath: string;
  sidebarPosition?: 'left' | 'right';
}

export function useGestureController({
  isSidebarOpen,
  setIsSidebarOpen,
  locationPath,
  sidebarPosition = 'left',
}: UseGestureControllerOptions) {
  const [sidebarDragOffset, setSidebarDragOffset] = useState<number | null>(null);
  const gestureStateRef = useRef<MobileGestureState>(createIdleGestureState());
  const rafIdRef = useRef<number | null>(null);

  const isRightSidebar = sidebarPosition === 'right';

  /* ───────── Batch Drag Offset with requestAnimationFrame ───────── */
  const scheduleOffsetUpdate = useCallback((offset: number | null) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      setSidebarDragOffset(offset);
      rafIdRef.current = null;
    });
  }, []);

  /* ───────── Reset ───────── */
  const resetSidebarGesture = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    gestureStateRef.current = createIdleGestureState();
    setSidebarDragOffset(null);
  }, []);

  /* ───────── Resize & Orientation Change Handling ───────── */
  useEffect(() => {
    if (!isClient) return;

    const handleResize = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT_PX) {
        setIsSidebarOpen(false);
        resetSidebarGesture();
      }
    };

    handleResize();

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [resetSidebarGesture, setIsSidebarOpen]);

  /* ───────── Route Change Reset ───────── */
  useEffect(() => {
    setIsSidebarOpen(false);
    resetSidebarGesture();
  }, [locationPath, resetSidebarGesture, setIsSidebarOpen]);

  /* ───────── Touch Start ───────── */
  const handleMobileTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!isClient || window.innerWidth >= MOBILE_BREAKPOINT_PX) {
        resetSidebarGesture();
        return;
      }

      if (event.touches.length !== 1) {
        resetSidebarGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      const sidebarWidth = getMobileSidebarWidth();
      const screenWidth = window.innerWidth;
      let mode: MobileGestureState['mode'] = null;

      if (isRightSidebar) {
        if (isSidebarOpen) {
          if (touch.clientX >= screenWidth - sidebarWidth - 24) {
            mode = 'close';
          }
        } else {
          if (touch.clientX >= screenWidth - MOBILE_SWIPE_EDGE_PX) {
            mode = 'open';
          }
        }
      } else {
        if (isSidebarOpen) {
          if (touch.clientX <= sidebarWidth + 24) {
            mode = 'close';
          }
        } else {
          if (touch.clientX <= MOBILE_SWIPE_EDGE_PX) {
            mode = 'open';
          }
        }
      }

      if (!mode) return;

      gestureStateRef.current = {
        mode,
        direction: 'undecided',
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        velocityX: 0,
        sidebarWidth,
      };

      scheduleOffsetUpdate(mode === 'close' ? 0 : null);
    },
    [isRightSidebar, isSidebarOpen, resetSidebarGesture, scheduleOffsetUpdate],
  );

  /* ───────── Touch Move ───────── */
  const handleMobileTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const gesture = gestureStateRef.current;
      if (!gesture.mode) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = Math.max(now - gesture.lastTime, 1);

      const velocity = (touch.clientX - gesture.lastX) / elapsed;

      // Smoother velocity blending
      gesture.velocityX = gesture.velocityX * 0.7 + velocity * 0.3;
      gesture.lastX = touch.clientX;
      gesture.lastTime = now;

      /* Direction lock */
      if (gesture.direction === 'undecided') {
        if (absDeltaY > MOBILE_SWIPE_VERTICAL_TOLERANCE_PX) {
          resetSidebarGesture();
          return;
        }

        if (absDeltaX > absDeltaY + MOBILE_SWIPE_DIRECTION_BIAS_PX) {
          gesture.direction = 'horizontal';
        } else if (absDeltaY > absDeltaX + MOBILE_SWIPE_DIRECTION_BIAS_PX) {
          resetSidebarGesture();
          return;
        } else {
          return;
        }
      }

      if (gesture.direction !== 'horizontal') return;

      if (absDeltaY > MOBILE_SWIPE_VERTICAL_TOLERANCE_PX) {
        resetSidebarGesture();
        return;
      }

      /* OPEN */
      if (gesture.mode === 'open') {
        if (isRightSidebar) {
          const edgeCompensation = clamp(
            gesture.startX - (window.innerWidth - MOBILE_SWIPE_EDGE_PX),
            0,
            MOBILE_SWIPE_EDGE_PX,
          );
          const revealedWidth = clamp(
            -deltaX + edgeCompensation,
            0,
            gesture.sidebarWidth + MOBILE_SWIPE_OVERSHOOT_PX,
          );
          const offset = clamp(gesture.sidebarWidth - revealedWidth, 0, gesture.sidebarWidth);
          scheduleOffsetUpdate(offset);
        } else {
          const edgeCompensation = clamp(
            MOBILE_SWIPE_EDGE_PX - gesture.startX,
            0,
            MOBILE_SWIPE_EDGE_PX,
          );
          const revealedWidth = clamp(
            deltaX + edgeCompensation,
            0,
            gesture.sidebarWidth + MOBILE_SWIPE_OVERSHOOT_PX,
          );
          const offset = clamp(gesture.sidebarWidth - revealedWidth, 0, gesture.sidebarWidth);
          scheduleOffsetUpdate(offset);
        }
      }

      /* CLOSE */
      if (gesture.mode === 'close') {
        if (isRightSidebar) {
          const offset = clamp(deltaX, 0, gesture.sidebarWidth + MOBILE_SWIPE_OVERSHOOT_PX);
          scheduleOffsetUpdate(clamp(offset, 0, gesture.sidebarWidth));
        } else {
          const offset = clamp(-deltaX, 0, gesture.sidebarWidth + MOBILE_SWIPE_OVERSHOOT_PX);
          scheduleOffsetUpdate(clamp(offset, 0, gesture.sidebarWidth));
        }
      }
    },
    [isRightSidebar, resetSidebarGesture, scheduleOffsetUpdate],
  );

  /* ───────── Touch End & Cancel ───────── */
  const handleMobileTouchEnd = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const gesture = gestureStateRef.current;
    if (!gesture.mode) {
      resetSidebarGesture();
      return;
    }

    const currentOffset = sidebarDragOffset ?? (gesture.mode === 'open' ? gesture.sidebarWidth : 0);
    const openProgress = 1 - currentOffset / gesture.sidebarWidth;

    let shouldOpen = false;

    if (gesture.mode === 'open') {
      if (isRightSidebar) {
        shouldOpen =
          gesture.velocityX <= -MOBILE_SWIPE_VELOCITY_THRESHOLD ||
          openProgress >= MOBILE_SWIPE_OPEN_RATIO ||
          gesture.startX - gesture.lastX >= MOBILE_SWIPE_TRIGGER_PX;
      } else {
        shouldOpen =
          gesture.velocityX >= MOBILE_SWIPE_VELOCITY_THRESHOLD ||
          openProgress >= MOBILE_SWIPE_OPEN_RATIO ||
          gesture.lastX - gesture.startX >= MOBILE_SWIPE_TRIGGER_PX;
      }
    } else {
      if (isRightSidebar) {
        shouldOpen = !(
          gesture.velocityX >= MOBILE_SWIPE_VELOCITY_THRESHOLD ||
          currentOffset / gesture.sidebarWidth >= MOBILE_SWIPE_CLOSE_RATIO ||
          gesture.lastX - gesture.startX >= MOBILE_SWIPE_TRIGGER_PX
        );
      } else {
        shouldOpen = !(
          gesture.velocityX <= -MOBILE_SWIPE_VELOCITY_THRESHOLD ||
          currentOffset / gesture.sidebarWidth >= MOBILE_SWIPE_CLOSE_RATIO ||
          gesture.startX - gesture.lastX >= MOBILE_SWIPE_TRIGGER_PX
        );
      }
    }

    setIsSidebarOpen(shouldOpen);
    resetSidebarGesture();
  }, [isRightSidebar, resetSidebarGesture, setIsSidebarOpen, sidebarDragOffset]);

  /* ───────── Derived State ───────── */
  const computedSidebarWidth = getMobileSidebarWidth();
  const isDragging = sidebarDragOffset !== null;

  const overlayOpacity = isDragging
    ? clamp(1 - (sidebarDragOffset ?? 0) / computedSidebarWidth, 0, 1) * 0.6
    : isSidebarOpen
      ? 0.6
      : 0;

  const transform = isDragging
    ? isRightSidebar
      ? `translateX(${sidebarDragOffset}px)`
      : `translateX(-${sidebarDragOffset}px)`
    : undefined;

  return {
    handleMobileTouchStart,
    handleMobileTouchMove,
    handleMobileTouchEnd,

    isSidebarDragging: isDragging,
    mobileOverlayOpacity: overlayOpacity,
    mobileSidebarTransform: transform,

    resetSidebarGesture,
    showMobileOverlay: isSidebarOpen || isDragging,
  };
}
