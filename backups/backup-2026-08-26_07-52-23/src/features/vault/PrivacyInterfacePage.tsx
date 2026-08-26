import React, { useEffect, useState } from 'react';
import { useVaultStore } from '../../store/vaultStore';
import { PrivacyInterfaceCard } from './components/SettingsVault/PrivacyInterfaceCard';

interface PrivacyInterfacePageProps {
  onBack?: () => void;
}

export const PrivacyInterfacePage = React.memo<PrivacyInterfacePageProps>(() => {
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
      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Privacy &amp; Interface
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text/45">
              Configure privacy protections, upload parameters, and interface display behavior.
            </p>
          </div>
        </div>
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
