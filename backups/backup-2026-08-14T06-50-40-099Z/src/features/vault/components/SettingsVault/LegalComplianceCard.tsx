import React from 'react';
import { Shield, Scale, Mail } from 'lucide-react';
import { SectionCard, ActionButton } from './SharedComponents';

interface LegalComplianceCardProps {
  onNavigate: (tab: string) => void;
}

export const LegalComplianceCard: React.FC<LegalComplianceCardProps> = ({ onNavigate }) => (
  <SectionCard
    title="Legal & Compliance"
    description="Review our privacy protocols, data collection policies, and the software license agreement."
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <ActionButton
        icon={Shield}
        label="Privacy Policy"
        onClick={() => onNavigate('legal#privacy')}
        variant="outline"
      />
      <ActionButton
        icon={Scale}
        label="License Agreement"
        onClick={() => onNavigate('legal#license')}
        variant="outline"
      />
      <ActionButton
        icon={Mail}
        label="Contact Support"
        onClick={() => onNavigate('contact')}
        variant="outline"
      />
    </div>
    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-text/30">
      Vault V(1.0.0) • Built for privacy
    </p>
  </SectionCard>
);
