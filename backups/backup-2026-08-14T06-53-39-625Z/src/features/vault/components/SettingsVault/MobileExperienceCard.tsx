import React from 'react';
import { Smartphone, Plus, Shield, Layout, Monitor, Share2 } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { SectionCard } from './SharedComponents';
import { SETTINGS_PANEL } from './Utils';

interface MobileExperienceCardProps {
  isInstalled: boolean;
  isStandalone: boolean;
  needsManualInstall: boolean;
  canInstall: boolean;
  onInstallRequest: () => void;
}

export const MobileExperienceCard: React.FC<MobileExperienceCardProps> = ({
  isInstalled,
  isStandalone,
  needsManualInstall,
  canInstall,
  onInstallRequest,
}) => (
  <SectionCard
    title="Mobile Experience"
    description="Optimize your vault usage for mobile devices. Add the vault to your home screen for a native, full-screen experience with improved performance."
  >
    <div className="grid gap-4 md:grid-cols-2">
      <div
        className={`${SETTINGS_PANEL} group relative flex flex-col overflow-hidden border-text/10 from-text/5 to-transparent p-5 dark:border-white/5 dark:from-white/5 sm:p-6`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-text/10">
              <Smartphone className="h-5 w-5 text-text" />
            </div>
            <div>
              <h3 className="font-bold text-text">Web App</h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text/30">
                Progressive Web App
              </p>
            </div>
          </div>
          {isInstalled ? (
            <span className="rounded-full bg-text/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text ring-1 ring-text/20">
              Installed
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/20">
              Install
            </span>
          )}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-text/60">
          Run the vault as a standalone application. Enjoy more screen real estate, faster access
          from your home screen, and improved hardware acceleration for encryption tasks.
        </p>

        <div className="mt-auto pt-6">
          {isStandalone ? (
            <div className="flex items-center gap-2 rounded-xl border border-text/10 bg-text/5 p-3 text-xs font-semibold text-text/80">
              <Shield className="h-4 w-4 text-emerald-500" />
              standalone mode
            </div>
          ) : needsManualInstall || canInstall ? (
            <Button
              onClick={onInstallRequest}
              className="group w-full border-none bg-text py-6 text-bg hover:bg-text/90"
            >
              <Plus className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
              {isInstalled ? 'Open Standalone App' : 'Add to Home Screen'}
            </Button>
          ) : isInstalled ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-text/10 bg-text/5 p-3 text-xs font-semibold text-text/80">
                <Layout className="h-4 w-4" />
                App is installed on this device
              </div>
              <p className="px-1 text-[10px] text-text/40">
                Launch the app from your home screen for the full experience.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-text/40">
              <Monitor className="h-4 w-4" />
              Device does not support direct installation
            </div>
          )}

          <Button
            variant="outline"
            onClick={onInstallRequest}
            className="mt-3 w-full border-white/5 bg-white/5 py-6 text-text/80 hover:bg-white/10"
          >
            <Layout className="mr-2 h-4 w-4" />
            Live Preview & Widgets
          </Button>
        </div>
      </div>

      <div className={`${SETTINGS_PANEL} flex flex-col justify-between p-5 sm:p-6`}>
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Share2 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-bold text-text">Installation Guide</h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text/30">
                Step by step
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-text/30" />
              <p className="text-sm text-text/60">
                <span className="font-bold text-text">iOS:</span> Tap the{' '}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-text/90">
                  Share
                </span>{' '}
                icon, then select <span className="font-bold text-text">"Add to Home Screen"</span>.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-text/30" />
              <p className="text-sm text-text/60">
                <span className="font-bold text-text">Android:</span> Tap the{' '}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-text/90">
                  ⋮
                </span>{' '}
                menu, then choose <span className="font-bold text-text">"Install App"</span>.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-text/30" />
              <p className="text-sm text-text/60">
                <span className="font-bold text-text">Desktop:</span> Look for the{' '}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-text/90">
                  Install
                </span>{' '}
                icon in your address bar.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-card-border/50 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
            Daily Security
          </p>
        </div>
      </div>
    </div>
  </SectionCard>
);
