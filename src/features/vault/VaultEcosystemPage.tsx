import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useVaultStore } from '../../store/vaultStore';
import { RealVaultEcosystemCard, type VaultCategoryStats } from './RealVaultEcosystemCard';

interface VaultEcosystemPageProps {
  onBack: () => void;
}

const INITIAL_STATS: VaultCategoryStats = {
  password: 0,
  note: 0,
  chat: 0,
  todo: 0,
  photo: 0,
  video: 0,
  audio: 0,
  secret: 0,
  contact: 0,
  document: 0,
  file: 0,
  location: 0,
  card: 0,
  identity: 0,
  wifi: 0,
  other: 0,
};

const VALID_TYPES = new Set<keyof VaultCategoryStats>([
  'password',
  'note',
  'chat',
  'todo',
  'photo',
  'video',
  'audio',
  'secret',
  'contact',
  'document',
  'file',
  'location',
  'card',
  'identity',
  'wifi',
]);

export const VaultEcosystemPage: React.FC<VaultEcosystemPageProps> = ({ onBack }) => {
  const items = useVaultStore((state) => state.items);

  // Filter active non-deleted items
  const activeItems = useMemo(() => items.filter((item) => !item.deletedAt), [items]);

  const categoryStats = useMemo(() => {
    const stats: VaultCategoryStats = { ...INITIAL_STATS };

    for (let i = 0; i < activeItems.length; i++) {
      const type = activeItems[i]?.type as keyof VaultCategoryStats;

      if (VALID_TYPES.has(type)) {
        stats[type] += 1;
      } else {
        stats.other += 1;
      }
    }

    return stats;
  }, [activeItems]);

  const itemCount = activeItems.length;

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-3 py-4 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                System Overview
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl lg:text-4xl">
              Vault Ecosystem
            </h1>

            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text/60 sm:text-sm lg:text-base">
              Explore how your encrypted vault components connect together in an interactive,
              real-time security architecture view.
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

        {/* 👇 Real-time Vault Ecosystem visualizer */}
        <RealVaultEcosystemCard itemCount={itemCount} categoryStats={categoryStats} />
      </div>
    </div>
  );
};

export default VaultEcosystemPage;
