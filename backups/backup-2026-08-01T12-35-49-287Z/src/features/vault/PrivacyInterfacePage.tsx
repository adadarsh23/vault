import React, { useState } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useVaultStore } from '../../store/vaultStore'
import { PrivacyInterfaceCard } from './components/SettingsVault/PrivacyInterfaceCard'

interface PrivacyInterfacePageProps {
  onBack: () => void
}

export const PrivacyInterfacePage: React.FC<PrivacyInterfacePageProps> = ({
  onBack,
}) => {
  const [showPrivacyInterface, setShowPrivacyInterface] = useState(false)
  const preferences = useVaultStore((state) => state.preferences)
  const updatePreferences = useVaultStore((state) => state.updatePreferences)
  const allowRestrictedTypes = useVaultStore(
    (state) => state.allowRestrictedTypes,
  )
  const setAllowRestrictedTypes = useVaultStore(
    (state) => state.setAllowRestrictedTypes,
  )
  const generatedCredentialLength = preferences.generatedCredentialLength
  const [generatedLengthInput, setGeneratedLengthInput] = useState(
    String(generatedCredentialLength),
  )

  React.useEffect(() => {
    setGeneratedLengthInput(String(generatedCredentialLength))
  }, [generatedCredentialLength])

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-4 py-5 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Privacy & Interface
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text/60 sm:text-base">
              Configure privacy protections and interface behavior for your
              vault experience.
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
            <Button
              onClick={() => setShowPrivacyInterface(true)}
              className="h-11 w-full rounded-2xl"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Open
            </Button>
          </div>
        </div>

        {showPrivacyInterface && (
          <PrivacyInterfaceCard
            preferences={preferences}
            updatePreferences={updatePreferences}
            allowRestrictedTypes={allowRestrictedTypes}
            setAllowRestrictedTypes={setAllowRestrictedTypes}
            generatedLengthInput={generatedLengthInput}
            setGeneratedLengthInput={setGeneratedLengthInput}
          />
        )}
      </div>
    </div>
  )
}

export default PrivacyInterfacePage
