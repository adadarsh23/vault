import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SystemLogsCard } from './components/SettingsVault/SystemLogsCard';

interface SystemLogsPageProps {
  onBack: () => void;
}

export const SystemLogsPage: React.FC<SystemLogsPageProps> = ({ onBack }) => {
  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-3 py-4 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                System Telemetry
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl lg:text-4xl">
              System Logs
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text/60 sm:text-sm lg:text-base">
              Review security events, runtime telemetry, and sync activity logs from your vault environment.
            </p>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={onBack}
              className="h-10 sm:h-11 flex-1 sm:flex-initial justify-center rounded-xl border border-card-border bg-card-bg px-4 text-xs sm:text-sm text-text/85 hover:bg-text/5 hover:text-text"
            >
              <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
              Back
            </Button>
          </div>
        </div>

        <SystemLogsCard />
      </div>
    </div>
  );
};

export default SystemLogsPage;
