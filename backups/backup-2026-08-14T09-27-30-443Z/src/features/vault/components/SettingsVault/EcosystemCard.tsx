import React from 'react';
import { Button } from '../../../../components/ui/Button';
import { SectionCard } from './SharedComponents';
import { Network } from 'lucide-react';

interface EcosystemCardProps {
  onNavigate: (tab: string) => void;
}

export const EcosystemCard: React.FC<EcosystemCardProps> = ({ onNavigate }) => (
  <SectionCard
    title="Vault Ecosystem"
    description="Explore how identity, encryption, sync, storage, and protected content fit together."
  >
    <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-5 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.18)] transition-colors dark:border-white/10 dark:bg-black sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm leading-6 text-text/50">Explore the Vault Architecture.</p>
        </div>

        <Button
          variant="secondary"
          onClick={() => onNavigate('ecosystem')}
          className="w-full justify-center sm:w-auto"
        >
          <Network className="mr-2 h-4 w-4" />
          Ecosystem
        </Button>
      </div>
    </div>
  </SectionCard>
);
