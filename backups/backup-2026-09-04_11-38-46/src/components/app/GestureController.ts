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

export function useGestureController({
  isSidebarOpen,
  setIsSidebarOpen,
  locationPath,
}: {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  locationPath: string;
}) {
  const [sidebarDragOffset, setSidebarDragOffset] = useState<number | null>(null);
  const gestureStateRef = useRef<MobileGestureState>(createIdleGestureState());

  /* ───────── Reset ───────── */
  const resetSidebarGesture = useCallback(() => {
    gestureStateRef.current = createIdleGestureState();
    setSidebarDragOffset(null);
  }, []);

  /* ───────── Resize Handling ───────── */
  useEffect(() => {
    if (!isClient) return;

    const handleResize = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT_PX) {
        setIsSidebarOpen(false);
        resetSidebarGesture();
      }
    };

    handleResize();

    // passive improves scroll perf
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
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

      let mode: MobileGestureState['mode'] = null;

      if (isSidebarOpen) {
        if (touch.clientX <= sidebarWidth + 24) {
          mode = 'close';
        }
      } else {
        if (touch.clientX <= MOBILE_SWIPE_EDGE_PX) {
          mode = 'open';
        }
      }

      gestureStateRef.current = {
        mode,
        direction: 'undecided',
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastTime: performance.now(),
        velocityX: 0,
        sidebarWidth,
      };

      setSidebarDragOffset(mode === 'close' ? 0 : null);
    },
    [isSidebarOpen, resetSidebarGesture],
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

      const now = performance.now();
      const elapsed = Math.max(now - gesture.lastTime, 1);

      const velocity = (touch.clientX - gesture.lastX) / elapsed;

      // smoother velocity blending
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

        setSidebarDragOffset(offset);
      }

      /* CLOSE */
      if (gesture.mode === 'close') {
        const offset = clamp(-deltaX, 0, gesture.sidebarWidth + MOBILE_SWIPE_OVERSHOOT_PX);

        setSidebarDragOffset(clamp(offset, 0, gesture.sidebarWidth));
      }
    },
    [resetSidebarGesture],
  );

  /* ───────── Touch End ───────── */
  const handleMobileTouchEnd = useCallback(() => {
    const gesture = gestureStateRef.current;

    if (!gesture.mode) {
      resetSidebarGesture();
      return;
    }

    const currentOffset = sidebarDragOffset ?? (gesture.mode === 'open' ? gesture.sidebarWidth : 0);

    const openProgress = 1 - currentOffset / gesture.sidebarWidth;

    let shouldOpen = false;

    if (gesture.mode === 'open') {
      shouldOpen =
        gesture.velocityX >= MOBILE_SWIPE_VELOCITY_THRESHOLD ||
        openProgress >= MOBILE_SWIPE_OPEN_RATIO ||
        gesture.lastX - gesture.startX >= MOBILE_SWIPE_TRIGGER_PX;
    } else {
      shouldOpen = !(
        gesture.velocityX <= -MOBILE_SWIPE_VELOCITY_THRESHOLD ||
        currentOffset / gesture.sidebarWidth >= MOBILE_SWIPE_CLOSE_RATIO ||
        gesture.startX - gesture.lastX >= MOBILE_SWIPE_TRIGGER_PX
      );
    }

    setIsSidebarOpen(shouldOpen);
    resetSidebarGesture();
  }, [resetSidebarGesture, setIsSidebarOpen, sidebarDragOffset]);

  /* ───────── Derived State ───────── */
  const computedSidebarWidth = getMobileSidebarWidth();
  const isDragging = sidebarDragOffset !== null;

  const overlayOpacity = isDragging
    ? clamp(1 - (sidebarDragOffset ?? 0) / computedSidebarWidth, 0, 1) * 0.6
    : isSidebarOpen
      ? 0.6
      : 0;

  const transform = isDragging ? `translateX(-${sidebarDragOffset}px)` : undefined;

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
