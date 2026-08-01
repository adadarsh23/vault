import React, { useState } from 'react';
import { ArrowLeft, Keyboard } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ShortcutsCard } from './components/SettingsVault/ShortcutsCard';

interface ShortcutsPageProps {
  onBack: () => void;
}

export const ShortcutsPage: React.FC<ShortcutsPageProps> = ({ onBack }) => {
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Backward-compatible alias to avoid runtime crashes from stale references.
  const showShortcutskeys = showShortcuts;

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-4 py-5 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Controls & Shortcuts
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-text/60 sm:text-base">
              Keyboard and gesture shortcuts for fast, secure vault workflows.
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
            {!showShortcutskeys && (
              <Button onClick={() => setShowShortcuts(true)} className="h-11 w-full rounded-2xl">
                <Keyboard className="mr-2 h-4 w-4" />
                Tap
              </Button>
            )}
          </div>
        </div>
        {/* 👇 Lazy mount only when needed */}
        {showShortcutskeys && <ShortcutsCard />}
      </div>
    </div>
  );
};

export default ShortcutsPage;
