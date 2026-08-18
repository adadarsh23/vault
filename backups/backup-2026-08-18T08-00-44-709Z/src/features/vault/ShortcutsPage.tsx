import React from 'react';
import { ShortcutsCard } from './components/SettingsVault/ShortcutsCard';

const ShortcutsPage: React.FC = () => {
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
      </section>

      <ShortcutsCard />
    </div>
  );
};

export { ShortcutsPage };
export default ShortcutsPage;
