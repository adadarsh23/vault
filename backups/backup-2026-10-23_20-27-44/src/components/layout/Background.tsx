import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import Particles, { ParticlesProvider } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Engine, ISourceOptions } from '@tsparticles/engine';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';

const loadBackgroundParticles = async (engine: Engine): Promise<void> => {
  try {
    await loadSlim(engine);
  } catch (error) {
    // Graceful fallback if tsparticles fails to initialize (e.g. WebGL context lost or canvas blocked)
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to initialize background particles engine:', error);
    }
  }
};

const getViewportCenter = () => {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.round(window.innerWidth / 2),
    y: Math.round(window.innerHeight / 2),
  };
};

function BackgroundComponent() {
  const shouldReduceMotion = useReducedMotion();

  const [particlesReady, setParticlesReady] = useState(false);
  const [particlesError, setParticlesError] = useState(false);
  const [enableFX, setEnableFX] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [viewportCenter, setViewportCenter] = useState(getViewportCenter);

  const rafIdRef = useRef<number | null>(null);

  // Check hardware power, data saver, and screen size
  const checkDeviceCapabilities = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const isNarrow = window.innerWidth < 640;
      const isCoarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const concurrency = nav?.hardwareConcurrency ?? 4;
      const isLowCore = concurrency <= 2;
      const isDataSaver = Boolean(
        (nav as { connection?: { saveData?: boolean } } | null)?.connection?.saveData,
      );

      setIsTouchDevice(isCoarse);
      setEnableFX(!shouldReduceMotion && !isNarrow && !isLowCore && !isDataSaver);
    } catch {
      // Safe fallback on any environment detection issue
      setEnableFX(!shouldReduceMotion);
    }
  }, [shouldReduceMotion]);

  useEffect(() => {
    checkDeviceCapabilities();

    if (typeof window === 'undefined') return;

    let resizeTimer: number;
    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        checkDeviceCapabilities();
        const center = getViewportCenter();
        setViewportCenter(center);
      }, 150);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [checkDeviceCapabilities]);

  // Particle initialization with idle fallback
  useEffect(() => {
    let cancelled = false;

    const enableParticles = () => {
      if (cancelled) return;

      try {
        const isAutomatedTest =
          typeof navigator !== 'undefined' &&
          (navigator.webdriver || /HeadlessChrome|PhantomJS|jsdom/i.test(navigator.userAgent));

        if (!isAutomatedTest) {
          setParticlesReady(true);
        }
      } catch {
        setParticlesError(true);
      }
    };

    if (typeof window === 'undefined') return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const id = idleWindow.requestIdleCallback(
        () => {
          enableParticles();
        },
        { timeout: 2000 },
      );

      return () => {
        cancelled = true;
        try {
          if (typeof idleWindow.cancelIdleCallback === 'function') {
            idleWindow.cancelIdleCallback.call(window, id);
          }
        } catch {
          // Graceful cleanup
        }
      };
    }

    const timer = window.setTimeout(() => {
      enableParticles();
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const mouseX = useMotionValue(viewportCenter.x);
  const mouseY = useMotionValue(viewportCenter.y);

  const smoothX = useSpring(mouseX, {
    stiffness: 80,
    damping: 20,
  });

  const smoothY = useSpring(mouseY, {
    stiffness: 80,
    damping: 20,
  });

  const parallaxX = useTransform(smoothX, (x) => (x - viewportCenter.x) * 0.02);
  const parallaxY = useTransform(smoothY, (y) => (y - viewportCenter.y) * 0.02);

  // Throttled mouse tracking for 60/120fps smooth performance
  useEffect(() => {
    if (!enableFX || shouldReduceMotion || isTouchDevice || typeof window === 'undefined') {
      return;
    }

    const syncViewport = () => {
      const center = getViewportCenter();
      setViewportCenter(center);
      mouseX.set(center.x);
      mouseY.set(center.y);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (rafIdRef.current !== null) return;
      const clientX = event.clientX;
      const clientY = event.clientY;

      rafIdRef.current = window.requestAnimationFrame(() => {
        mouseX.set(clientX);
        mouseY.set(clientY);
        rafIdRef.current = null;
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [enableFX, isTouchDevice, mouseX, mouseY, shouldReduceMotion]);

  const particleOptions = useMemo<ISourceOptions>(
    () => ({
      fullScreen: {
        enable: false,
      },
      background: {
        color: 'transparent',
      },
      fpsLimit: enableFX ? 60 : 30,
      detectRetina: true,
      particles: {
        number: {
          value: enableFX ? 40 : 15,
        },
        color: {
          value: '#ffffff',
        },
        opacity: {
          value: enableFX ? 0.2 : 0.1,
        },
        size: {
          value: {
            min: 1,
            max: 3,
          },
        },
        links: {
          enable: false,
        },
        move: {
          enable: true,
          speed: enableFX ? 0.4 : 0.2,
          outModes: {
            default: 'out',
          },
        },
      },
    }),
    [enableFX],
  );

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none isolate w-full max-w-full select-none"
      aria-hidden="true"
    >
      {/* Dynamic or static gradient background */}
      {enableFX && !shouldReduceMotion ? (
        <motion.div
          className="absolute inset-0 opacity-70 blur-[100px] will-change-[background]"
          animate={{
            background: [
              'radial-gradient(circle at 10% 15%, rgba(99,102,241,0.35), transparent 55%)',
              'radial-gradient(circle at 85% 20%, rgba(236,72,153,0.35), transparent 60%)',
              'radial-gradient(circle at 20% 80%, rgba(34,197,94,0.30), transparent 60%)',
              'radial-gradient(circle at 80% 75%, rgba(249,115,22,0.30), transparent 60%)',
              'radial-gradient(circle at 50% 20%, rgba(59,130,246,0.30), transparent 55%)',
              'radial-gradient(circle at 40% 60%, rgba(168,85,247,0.30), transparent 60%)',
              'radial-gradient(circle at 65% 45%, rgba(6,182,212,0.30), transparent 60%)',
              'radial-gradient(circle at 30% 40%, rgba(250,204,21,0.28), transparent 55%)',
              'radial-gradient(circle at 70% 10%, rgba(244,63,94,0.28), transparent 60%)',
              'radial-gradient(circle at 5% 60%, rgba(20,184,166,0.28), transparent 55%)',
              'radial-gradient(circle at 95% 50%, rgba(251,146,60,0.28), transparent 60%)',
              'radial-gradient(circle at 50% 95%, rgba(129,140,248,0.25), transparent 65%)',
            ],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ) : (
        <div className="absolute inset-0 opacity-60 blur-[90px] bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(236,72,153,0.2),transparent_60%)]" />
      )}

      {/* Floating parallax ambient layer */}
      <motion.div
        style={{
          x: parallaxX,
          y: parallaxY,
        }}
        className="absolute -top-[20%] -left-[20%] h-[60%] w-[60%] rounded-full bg-white/10 blur-[120px] will-change-transform"
      />

      {enableFX && (
        <motion.div
          className="absolute bottom-[10%] right-[10%] h-[300px] w-[300px] bg-white/10 blur-[100px] will-change-transform"
          animate={{
            borderRadius: ['40% 60%', '60% 40%', '50% 50%', '40% 60%'],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Background Particles with Error Boundary Fallback */}
      {particlesReady && !particlesError && (
        <ErrorBoundary fallback={<div className="hidden" />}>
          <ParticlesProvider init={loadBackgroundParticles}>
            <Particles
              id="background-particles"
              className="absolute inset-0"
              options={particleOptions}
            />
          </ParticlesProvider>
        </ErrorBoundary>
      )}

      {/* Mouse Follow Glow - Desktop Only */}
      {enableFX && !shouldReduceMotion && !isTouchDevice && (
        <motion.div
          className="absolute h-[800px] w-[800px] rounded-full opacity-30 pointer-events-none will-change-transform"
          style={{
            x: smoothX,
            y: smoothY,
            translateX: '-50%',
            translateY: '-50%',
          }}
        >
          <div className="h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.15),transparent_70%)]" />
        </motion.div>
      )}
    </div>
  );
}

export const Background = memo(BackgroundComponent);
export default Background;
