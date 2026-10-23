import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useVaultStore } from '../../store/vaultStore';
import { PrivacyInterfaceCard } from './components/SettingsVault/PrivacyInterfaceCard';

interface PrivacyInterfacePageProps {
  onBack?: () => void;
}

export const PrivacyInterfacePage = React.memo<PrivacyInterfacePageProps>(({ onBack }) => {
  const preferences = useVaultStore((state) => state.preferences);
  const updatePreferences = useVaultStore((state) => state.updatePreferences);
  const allowRestrictedTypes = useVaultStore((state) => state.allowRestrictedTypes);
  const setAllowRestrictedTypes = useVaultStore((state) => state.setAllowRestrictedTypes);

  const generatedCredentialLength = preferences.generatedCredentialLength;

  const [generatedLengthInput, setGeneratedLengthInput] = useState(
    String(generatedCredentialLength),
  );

  useEffect(() => {
    setGeneratedLengthInput(String(generatedCredentialLength));
  }, [generatedCredentialLength]);

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
              Preferences
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl md:text-4xl">
            Privacy &amp; Interface
          </h1>
          <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-text/60">
            Configure privacy protections, upload parameters, and interface display behavior.
          </p>
        </div>
        {onBack && (
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
        )}
      </section>

      <PrivacyInterfaceCard
        preferences={preferences}
        updatePreferences={updatePreferences}
        allowRestrictedTypes={allowRestrictedTypes}
        setAllowRestrictedTypes={setAllowRestrictedTypes}
        generatedLengthInput={generatedLengthInput}
        setGeneratedLengthInput={setGeneratedLengthInput}
      />
    </div>
  );
});
PrivacyInterfacePage.displayName = 'PrivacyInterfacePage';

export default PrivacyInterfacePage;
