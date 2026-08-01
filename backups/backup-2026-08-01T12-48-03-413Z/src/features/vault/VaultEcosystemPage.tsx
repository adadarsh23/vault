import React, { useMemo, useState } from 'react';
import { ArrowLeft, Network } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useVaultStore } from '../../store/vaultStore';
import { RealVaultEcosystemCard, type VaultCategoryStats } from './RealVaultEcosystemCard';
import {} from 'lucide-react';

interface VaultEcosystemPageProps {
  onBack: () => void;
}

const INITIAL_STATS: VaultCategoryStats = {
  password: 0,
  note: 0,
  photo: 0,
  video: 0,
  audio: 0,
  secret: 0,
  document: 0,
  location: 0,
  other: 0,
};

const VALID_TYPES = new Set<keyof VaultCategoryStats>([
  'password',
  'note',
  'photo',
  'video',
  'audio',
  'secret',
  'document',
  'location',
]);

export const VaultEcosystemPage: React.FC<VaultEcosystemPageProps> = ({ onBack }) => {
  const items = useVaultStore((state) => state.items);
  const [showEcosystem, setShowEcosystem] = useState(false);

  const categoryStats = useMemo(() => {
    const stats: VaultCategoryStats = { ...INITIAL_STATS };

    for (let i = 0; i < items.length; i++) {
      const type = items[i]?.type as keyof VaultCategoryStats;

      if (VALID_TYPES.has(type)) {
        stats[type] += 1;
      } else {
        stats.other += 1;
      }
    }

    return stats;
  }, [items]);

  const itemCount = items.length;

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-4 py-5 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Vault Ecosystem
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-text/60 sm:text-base">
              Explore how your vault components connect together in a secure architecture view.
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

            {!showEcosystem && (
              <Button onClick={() => setShowEcosystem(true)} className="h-11 w-full rounded-2xl">
                <Network className="mr-2 h-4 w-4" />
                Open
              </Button>
            )}
          </div>
        </div>

        {/* 👇 Lazy mount only when needed */}
        {showEcosystem && (
          <RealVaultEcosystemCard itemCount={itemCount} categoryStats={categoryStats} />
        )}
      </div>
    </div>
  );
};

export default VaultEcosystemPage;
