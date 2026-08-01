import React, { useState } from 'react';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SystemLogsCard } from './components/SettingsVault/SystemLogsCard';

interface SystemLogsPageProps {
  onBack: () => void;
}

export const SystemLogsPage: React.FC<SystemLogsPageProps> = ({ onBack }) => {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-4 py-5 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              System Logs
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text/60 sm:text-base">
              View security and runtime telemetry from your vault environment.
            </p>
          </div>

          <div className="flex gap-3 lg:flex-col">
            <Button
              variant="ghost"
              onClick={onBack}
              className="h-11 w-full justify-center rounded-2xl border border-card-border bg-card-bg px-5 text-text/85 hover:bg-text/5 hover:text-text lg:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {!showLogs && (
              <Button onClick={() => setShowLogs(true)} className="h-11 w-full rounded-2xl">
                <ClipboardList className="mr-2 h-4 w-4" />
                Open
              </Button>
            )}
          </div>
        </div>

        {showLogs && <SystemLogsCard />}
      </div>
    </div>
  );
};

export default SystemLogsPage;
