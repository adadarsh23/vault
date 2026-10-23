import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ShortcutsCard } from './components/SettingsVault/ShortcutsCard';

interface ShortcutsPageProps {
  onBack?: () => void;
}

const ShortcutsPage: React.FC<ShortcutsPageProps> = ({ onBack }) => {
  useEffect(() => {
    if (!onBack) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  return (
    <div className="space-y-4 sm:space-y-5 print:space-y-2">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 space-y-1 sm:space-y-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl md:text-4xl print:text-2xl print:text-black">
              Controls &amp; Shortcuts
            </h1>
          </div>

          <p className="mt-1 sm:mt-2 max-w-3xl text-xs sm:text-sm leading-relaxed sm:leading-6 text-text/45 print:text-xs print:text-gray-600">
            Keyboard and gesture shortcuts for fast, secure, and efficient vault navigation.
          </p>
        </div>

        {onBack && (
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 print:hidden">
            <Button
              variant="outline"
              onClick={onBack}
              className="h-10 sm:h-11 flex-1 sm:flex-initial justify-center rounded-xl border border-card-border bg-card-bg px-4 text-xs sm:text-sm text-text/85 hover:bg-text/5 hover:text-text"
            >
              <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
              Back
            </Button>
          </div>
        )}
      </section>

      <ShortcutsCard />
    </div>
  );
};

export { ShortcutsPage };
export default ShortcutsPage;
