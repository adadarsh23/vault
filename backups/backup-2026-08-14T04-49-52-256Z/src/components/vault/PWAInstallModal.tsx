import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Smartphone,
  Layout,
  Lock,
  Clock,
  ExternalLink,
  Check,
  Share,
  PlusSquare,
  ArrowRight,
  LayoutDashboard,
  Key,
  Plus,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => void | Promise<void>;
  isInstalled: boolean;
}

type WidgetType = 'small' | 'medium' | 'large';
type ViewType = 'preview' | 'instructions';

interface PlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isSafari: boolean;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  isInstalled,
}) => {
  const [selectedWidget, setSelectedWidget] = useState<WidgetType>('small');
  const [view, setView] = useState<ViewType>('preview');
  const [platform, setPlatform] = useState<PlatformInfo>({
    isIOS: false,
    isAndroid: false,
    isDesktop: false,
    isSafari: false,
  });
  const [isInstalling, setIsInstalling] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Platform detection
  useEffect(() => {
    if (!isOpen) return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isSafari = isIOS && /safari/.test(ua);
    const isDesktop = !isIOS && !isAndroid;

    setPlatform({ isIOS, isAndroid, isDesktop, isSafari });

    // Default iOS to instructions view since they can't trigger native prompt
    setView(isIOS ? 'instructions' : 'preview');
  }, [isOpen]);

  // Accessibility: Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', handleTab);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const widgetContent = useMemo(
    () => ({
      small: (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl">
          <div className="rounded-full bg-text/10 p-2">
            <Lock className="h-5 w-5 text-text" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-tight text-text/90">Vault</p>
          <div className="h-1 w-8 rounded-full bg-text/20" />
        </div>
      ),
      medium: (
        <div className="flex h-full w-full flex-col justify-between rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-text" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-text/70">
              Vault Actions
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex aspect-square items-center justify-center rounded-lg bg-white/5">
              <LayoutDashboard className="h-4 w-4 text-white/50" />
            </div>
            <div className="flex aspect-square items-center justify-center rounded-lg bg-white/5">
              <Key className="h-4 w-4 text-white/50" />
            </div>
            <div className="flex aspect-square items-center justify-center rounded-lg bg-white/5">
              <Plus className="h-4 w-4 text-white/50" />
            </div>
          </div>
        </div>
      ),
      large: (
        <div className="flex h-full w-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-text" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text/70">
                Recently Secured
              </span>
            </div>
            <Clock className="h-3 w-3 text-white/30" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={`skeleton-${i}`}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-2 px-3"
              >
                <div className="h-2 w-2 rounded-full bg-text/20" />
                <div className="h-2 w-20 rounded-full bg-white/10" />
                <div className="ml-auto h-2 w-8 rounded-full bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      ),
    }),
    []
  );

  const InstructionStep = ({
    icon: Icon,
    text,
    step,
  }: {
    icon: React.ElementType;
    text: string;
    step: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: step * 0.1 }}
      className="group flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-text text-bg text-sm font-black shadow-lg shadow-text/10">
        {step}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2 text-sm font-bold text-text group-hover:text-text">
          <Icon className="h-4 w-4 text-text/60" />
          <span className="leading-tight">{text}</span>
        </div>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center p-2 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby="modal-description"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-bg/80 backdrop-blur-xl"
          />

          <motion.div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative grid w-full max-h-[96vh] max-w-5xl overflow-y-auto custom-scrollbar rounded-[1.75rem] sm:rounded-[2.5rem] border border-card-border bg-card-bg shadow-xl sm:shadow-2xl dark:border-white/10 dark:bg-black lg:max-h-[88vh] lg:grid-cols-[0.95fr_1.05fr]"
          >
            {/* Left Side: Phone Preview - Hidden on small mobile when instructions are shown */}
            <div
              className={`relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-text/[0.03] to-transparent px-4 pb-4 pt-5 sm:flex sm:p-8 lg:p-10 ${view === 'instructions' ? 'md:flex' : 'sm:flex'}`}
            >
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-text/5 blur-[60px] sm:blur-[100px]" />
                <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-violet-500/5 blur-[60px] sm:blur-[100px]" />
              </div>

              {/* Phone Frame */}
              <div className="relative z-10 aspect-[9/19] w-full max-w-[150px] sm:max-w-[220px] lg:max-w-[280px] rounded-[2rem] sm:rounded-[2.5rem] border-[5px] lg:border-8 border-[#1a1a1a] bg-black p-2.5 sm:p-3 lg:p-4 shadow-2xl ring-1 ring-white/10">
                <div className="absolute left-1/2 top-0 h-4 lg:h-6 w-24 lg:w-32 -translate-x-1/2 rounded-b-2xl bg-[#1a1a1a]" />
                <div className="flex h-full w-full flex-col p-1.5 sm:p-2">
                  <div className="flex items-center justify-between px-3 py-2 text-[9px] sm:px-4 sm:text-[10px] font-bold text-white/40">
                    <span>9:41</span>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-white/20" />
                      <div className="h-2 w-3 rounded-sm bg-white/40" />
                    </div>
                  </div>

                  <div className="mt-5 space-y-4 sm:mt-8 sm:space-y-6">
                    <motion.div
                      key={selectedWidget}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`mx-auto ${
                        selectedWidget === 'small'
                          ? 'aspect-square w-24 sm:w-32'
                          : selectedWidget === 'medium'
                            ? 'aspect-[2/1] w-full'
                            : 'aspect-square w-full'
                      }`}
                    >
                      {widgetContent[selectedWidget]}
                    </motion.div>

                    <div className="grid grid-cols-4 gap-2 px-1 sm:gap-4 sm:px-2">
                      <div className="flex flex-col items-center gap-1 sm:gap-1.5">
                        <div className="flex aspect-square w-full items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-text/80 to-text shadow-lg shadow-text/20">
                          <Lock className="h-3.5 w-3.5 sm:h-5 lg:h-6 text-bg" />
                        </div>
                        <span className="text-[7px] sm:text-[8px] font-bold text-text/60">
                          Vault
                        </span>
                      </div>
                      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div
                          key={`app-${i}`}
                          className="flex flex-col items-center gap-1 sm:gap-1.5"
                        >
                          <div className="aspect-square w-full rounded-lg sm:rounded-xl bg-white/5" />
                          <div className="h-1 w-4 sm:w-6 rounded-full bg-white/10" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-1.5 mt-auto flex justify-around rounded-[1.5rem] sm:mb-2 sm:rounded-[2rem] bg-white/5 p-2 sm:p-3 backdrop-blur-md">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={`nav-${i}`}
                        className="h-6 w-6 rounded-lg bg-white/10 sm:h-8 sm:w-8 sm:rounded-xl lg:h-10 lg:w-10"
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="mt-5 hidden gap-2 sm:mt-8 sm:flex"
                role="tablist"
                aria-label="Widget preview selection"
              >
                {(['small', 'medium', 'large'] as WidgetType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedWidget(type)}
                    aria-selected={selectedWidget === type}
                    role="tab"
                    aria-label={`Preview ${type} widget`}
                    className={`h-2 w-2 rounded-full transition-all ${selectedWidget === type ? 'w-6 bg-text' : 'bg-text/20 hover:bg-text/40'}`}
                  />
                ))}
              </div>
            </div>

            {/* Right Side: Info & Controls */}
            <div className="flex flex-col border-card-border p-4 pt-14 sm:p-10 lg:border-l lg:p-12 dark:border-white/5">
              <button
                onClick={onClose}
                aria-label="Close modal"
                className="absolute right-4 top-4 z-20 rounded-full bg-text/5 p-2 text-text/40 transition-all hover:bg-text/10 hover:text-text focus:outline-none focus:ring-2 focus:ring-text/20 sm:right-6 sm:top-6 lg:right-8 lg:top-8"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex-1">
                {view === 'preview' ? (
                  <>
                    <div className="inline-flex items-center gap-2 rounded-full border border-text/10 bg-text/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-text/60">
                      <Smartphone className="h-3 w-3" />
                      Premium Experience
                    </div>

                    <div className="relative mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-text/10 via-transparent to-cyan-500/10 p-4 sm:hidden">
                      <div className="pointer-events-none absolute inset-0">
                        <motion.div
                          animate={{ x: ['-100%', '120%'] }}
                          transition={{
                            duration: 2.8,
                            ease: 'easeInOut',
                            repeat: Infinity,
                            repeatDelay: 0.5,
                          }}
                          className="absolute inset-y-0 w-24 bg-white/10 blur-2xl"
                        />
                      </div>
                      <div className="relative flex items-center gap-3">
                        <motion.div
                          animate={{ y: [0, -6, 0], rotate: [0, -4, 4, 0] }}
                          transition={{
                            duration: 3.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="flex h-14 w-18 items-center justify-center rounded-2xl bg-text text-bg shadow-lg shadow-text/20"
                        >
                          <Lock className="h-6 w-6" />
                        </motion.div>
                        <div>
                          <p className="text-sm font-bold text-text">Install Vault</p>
                          <p className="mt-1 text-xs leading-5 text-text/50">
                            full-screen access with a smoother app-like feel.
                          </p>
                        </div>
                      </div>

                      <div className="relative mt-4 grid grid-cols-3 gap-2">
                        {(['small', 'medium', 'large'] as WidgetType[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => setSelectedWidget(type)}
                            className={`rounded-2xl border px-3 py-2 text-xs font-bold capitalize transition-all ${
                              selectedWidget === type
                                ? 'border-text/40 bg-text/10 text-text'
                                : 'border-white/10 bg-white/5 text-text/55'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <h1
                      id="modal-title"
                      className="mt-4 text-2xl font-bold tracking-tight text-text sm:text-3xl lg:mt-6 lg:text-4xl"
                    >
                      Vault is Better as a <span className="text-text/70">Real App</span>
                    </h1>

                    <p
                      id="modal-description"
                      className="mt-3 max-w-md text-sm leading-relaxed text-text/45 lg:mt-4"
                    >
                      Install to your home screen for instant access, sleek widgets, and an
                      immersive standalone experience.
                    </p>

                    <div
                      className="mt-8 grid gap-3 max-[640px]:gap-2 lg:mt-10 lg:gap-4"
                      role="radiogroup"
                      aria-label="Widget options"
                    >
                      {(['small', 'medium', 'large'] as WidgetType[]).map((type) => {
                        const icons = {
                          small: Lock,
                          medium: Layout,
                          large: Clock,
                        };
                        const Icon = icons[type];
                        const titles = {
                          small: 'Status Widget',
                          medium: 'Action Matrix',
                          large: 'Intelligence Feed',
                        };
                        const descriptions = {
                          small: 'Know your vault state at a glance.',
                          medium: 'Capture notes and media instantly.',
                          large: 'Quick access to your primary records.',
                        };

                        return (
                          <button
                            key={type}
                            onClick={() => setSelectedWidget(type)}
                            role="radio"
                            aria-checked={selectedWidget === type}
                            className={`hidden items-center gap-3 rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-text/20 sm:flex lg:gap-4 ${
                              selectedWidget === type
                                ? 'border-text/50 bg-text/5'
                                : 'border-card-border bg-text/[0.02] hover:bg-text/[0.04] dark:border-white/5'
                            }`}
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                                selectedWidget === type
                                  ? 'bg-text text-bg border-text'
                                  : 'bg-text/5 border-card-border text-text'
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h3 className="text-sm font-bold text-text">{titles[type]}</h3>
                              <p className="text-xs text-text/40">{descriptions[type]}</p>
                            </div>
                            {selectedWidget === type && <Check className="h-4 w-4 text-text" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-orange-500 border border-orange-500/20">
                      <Smartphone className="h-3 w-3" />
                      Installation Guide
                    </div>

                    <h1
                      id="modal-title"
                      className="text-2xl font-bold tracking-tight text-text sm:text-3xl lg:text-4xl"
                    >
                      Add Vault to <span className="text-text/70">Home Screen</span>
                    </h1>

                    <p
                      id="modal-description"
                      className="text-sm leading-relaxed text-text/45 max-w-md"
                    >
                      Follow these simple steps to install Vault on your{' '}
                      {platform.isIOS ? 'iPhone' : 'device'}.
                    </p>

                    <div className="mt-8 space-y-3">
                      {platform.isIOS ? (
                        <>
                          <InstructionStep
                            step={1}
                            icon={Share}
                            text="Tap the Share button in Safari"
                          />
                          <InstructionStep
                            step={2}
                            icon={PlusSquare}
                            text='Scroll down and tap "Add to Home Screen"'
                          />
                          <InstructionStep
                            step={3}
                            icon={Check}
                            text='Tap "Add" in the top-right corner'
                          />
                        </>
                      ) : (
                        <>
                          <InstructionStep
                            step={1}
                            icon={ExternalLink}
                            text="Tap the three-dot menu in your browser"
                          />
                          <InstructionStep
                            step={2}
                            icon={Smartphone}
                            text='Select "Install app" or "Add to Home screen"'
                          />
                          <InstructionStep step={3} icon={Check} text="Confirm the installation" />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-white/5 pt-5 sm:mt-8 sm:flex-row lg:mt-10">
                {view === 'preview' ? (
                  <>
                    <Button
                      size="md"
                      loading={isInstalling}
                      onClick={async () => {
                        if (platform.isIOS) {
                          setView('instructions');
                        } else {
                          setIsInstalling(true);
                          try {
                            await onInstall();
                          } finally {
                            // Give some time for the native prompt to appear/process
                            setTimeout(() => setIsInstalling(false), 800);
                          }
                        }
                      }}
                      disabled={isInstalled}
                      className="h-12 flex-[2] rounded-2xl bg-text font-bold text-bg hover:bg-text/90 lg:h-14"
                    >
                      {isInstalled
                        ? 'Already Installed'
                        : platform.isIOS
                          ? 'Next Step'
                          : 'Install Vault'}
                      {!isInstalled && !isInstalling && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                    <Button
                      size="md"
                      variant="outline"
                      onClick={onClose}
                      disabled={isInstalling}
                      className="h-12 flex-1 rounded-2xl border-card-border hover:bg-text/5 dark:border-white/10 lg:h-14"
                    >
                      Maybe Later
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="lg"
                      onClick={onClose}
                      className="h-12 flex-1 rounded-2xl bg-text font-bold text-bg hover:bg-text/90 lg:h-14"
                    >
                      Got it, thanks
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => setView('preview')}
                      className="h-12 flex-1 rounded-2xl border-card-border hover:bg-text/5 dark:border-white/10 lg:h-14"
                    >
                      Back to Preview
                    </Button>
                  </>
                )}
              </div>

              <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-text/20">
                {isInstalled
                  ? 'Vault is currently active as an app'
                  : 'Ready for iOS, Android, and Desktop'}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
