import { lazy, Suspense, useEffect, useState } from 'react';
import { Lock, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';

const Background = lazy(() =>
  import('../components/layout/Background').then((module) => ({
    default: module.Background || module.default,
  }))
);

const Footer = lazy(() =>
  import('../components/layout/Footer').then((module) => ({
    default: module.Footer || module.default,
  }))
);

interface LandingPageProps {
  onEnterVault: () => void;
}

export function LandingPage({ onEnterVault }: LandingPageProps) {
  const [showDecorativeEffects, setShowDecorativeEffects] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(
        () => {
          setShowDecorativeEffects(true);
        },
        { timeout: 1200 }
      );
      return () => {
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(() => {
      setShowDecorativeEffects(true);
    }, 700);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-text overflow-x-hidden selection:bg-text selection:text-bg">
      {showDecorativeEffects ? (
        <Suspense fallback={null}>
          <Background />
        </Suspense>
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]"
        />
      )}

      <nav className="relative z-10 w-full border-b border-card-border/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-text text-bg shrink-0 ">
              <Lock className="w-7 h-7 sm:w-6 sm:h-6" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight">Vault</span>
          </div>

          <Button
            className="rounded-full px-5 sm:px-6 h-10 sm:h-11 text-sm sm:text-base shadow-lg shadow-text/10"
            onClick={onEnterVault}
            data-testid="enter-vault-button"
          >
            Enter Vault
          </Button>
        </div>
      </nav>

      <main className="relative z-10 flex min-h-[calc(100dvh-4rem)] items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/[0.03] px-4 py-2 text-[10px] sm:text-xs font-semibold backdrop-blur tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Military-grade Encryption
            </div>

            <h1 className="text-[clamp(1.8rem,9vw,9rem)] font-black tracking-tighter leading-[0.95] sm:leading-[1.05]">
              <span className="block whitespace-nowrap">Your digital life,</span>
              <span
                className="block bg-gradient-to-r from-text/60 via-text to-text/40 bg-clip-text text-transparent italic bg-[length:200%_auto] transform-gpu py-1 sm:py-2"
                style={{ backgroundSize: '200% auto' }}
              >
                truly private.
              </span>
            </h1>

            <p className="mt-8 max-w-2xl text-base sm:text-lg md:text-xl text-text/50 leading-relaxed font-medium px-4 sm:px-0">
              A secure and private vault for your photos, notes, and sensitive data. Everything is
              encrypted locally. Your keys never leave your device.
            </p>

            <div className="mt-12 flex w-full flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="w-full sm:w-auto rounded-full px-10 h-14 text-lg shadow-2xl shadow-text/10 hover:shadow-text/20 transition-all hover:-translate-y-1 active:scale-95"
                onClick={onEnterVault}
                data-testid="get-started-button"
              >
                Get Started
                <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {showDecorativeEffects ? (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      ) : null}
    </div>
  );
}

export default LandingPage;
