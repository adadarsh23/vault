import React, { useEffect, useState } from 'react';
import { Binary, Copy, Check, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import { SectionCard } from './SharedComponents';
import { Button } from '../../../../components/ui/Button';
import { useIntegrityStore } from '../../../../store/integrityStore';
import { useVaultStore } from '../../../../store/vaultStore';
import { toast } from 'sonner';

export const MerkleIntegrityCard: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const rootHash = useIntegrityStore((state) => state.rootHash);
  const algorithm = useIntegrityStore((state) => state.algorithm);
  const totalLeaves = useIntegrityStore((state) => state.totalLeaves);
  const treeDepth = useIntegrityStore((state) => state.treeDepth);
  const lastAuditAt = useIntegrityStore((state) => state.lastAuditAt);
  const lastAuditStatus = useIntegrityStore((state) => state.lastAuditStatus);
  const isAuditing = useIntegrityStore((state) => state.isAuditing);
  const fetchIntegrityStatus = useIntegrityStore((state) => state.fetchIntegrityStatus);
  const rebuildLocalMerkleTree = useIntegrityStore((state) => state.rebuildLocalMerkleTree);
  const auditIntegrity = useIntegrityStore((state) => state.auditIntegrity);
  const simulateBitFlipAttack = useIntegrityStore((state) => state.simulateBitFlipAttack);

  const [copiedRoot, setCopiedRoot] = useState(false);

  useEffect(() => {
    fetchIntegrityStatus();
  }, [fetchIntegrityStatus]);

  useEffect(() => {
    if (items.length > 0) {
      rebuildLocalMerkleTree(items);
    }
  }, [items, rebuildLocalMerkleTree]);

  const handleCopyRoot = () => {
    if (rootHash) {
      void navigator.clipboard.writeText(rootHash);
      setCopiedRoot(true);
      toast.success('Merkle Root copied to clipboard');
      setTimeout(() => setCopiedRoot(false), 2000);
    }
  };

  const handleRunAudit = async () => {
    await auditIntegrity();
  };

  const handleSimulateAttack = async () => {
    toast.info('Simulating 1-bit flip mutation in cloud storage payload...');
    await simulateBitFlipAttack();
  };

  return (
    <SectionCard
      title="Merkle Tree Cryptographic Integrity"
      description="Protect photos and media against bit-flip attacks, bit-rot, and silent cloud storage tampering with BLAKE3 / SHA-512 domain-separated cryptographic chains."
    >
      <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-5 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.18)] transition-colors dark:border-white/10 dark:bg-black sm:p-6 space-y-6">
        {/* Merkle Root Header Card */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Binary className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-emerald-400/80 font-bold">
                  Active Cryptographic Merkle Root
                </span>
                <p className="text-sm font-semibold text-text">
                  RFC 6962 Domain-Separated Commitment
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-500/20 px-2.5 py-1 text-xs font-bold text-blue-400 border border-blue-500/30">
                Algorithm: {algorithm.toUpperCase()}
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Immutable
              </span>
            </div>
          </div>

          {/* Root Hash Display */}
          <div className="flex items-center justify-between rounded-xl bg-black/40 p-3 border border-white/5 font-mono text-xs text-text/80 select-all overflow-x-auto">
            <span className="truncate max-w-[300px] sm:max-w-md font-semibold text-emerald-300">
              {rootHash || '0x0000000000000000000000000000000000000000000000000000000000000000'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyRoot}
              className="h-7 px-2.5 text-xs text-text/60 hover:text-text shrink-0 ml-2"
            >
              {copiedRoot ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy Root
                </>
              )}
            </Button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
            <div className="rounded-xl bg-card-bg/60 border border-card-border/50 p-3">
              <span className="text-[10px] uppercase tracking-wider text-text/40">
                Bound Assets
              </span>
              <p className="text-sm font-bold text-text mt-0.5">{totalLeaves || items.length}</p>
            </div>

            <div className="rounded-xl bg-card-bg/60 border border-card-border/50 p-3">
              <span className="text-[10px] uppercase tracking-wider text-text/40">Tree Depth</span>
              <p className="text-sm font-bold text-text mt-0.5">{treeDepth || 1} Levels</p>
            </div>

            <div className="rounded-xl bg-card-bg/60 border border-card-border/50 p-3">
              <span className="text-[10px] uppercase tracking-wider text-text/40">Last Audit</span>
              <p className="text-xs font-semibold text-text mt-0.5 truncate">
                {lastAuditAt ? new Date(lastAuditAt).toLocaleTimeString() : 'Pending Scan'}
              </p>
            </div>

            <div className="rounded-xl bg-card-bg/60 border border-card-border/50 p-3">
              <span className="text-[10px] uppercase tracking-wider text-text/40">
                Audit Status
              </span>
              <p
                className={`text-xs font-bold mt-0.5 ${
                  lastAuditStatus === 'corrupted'
                    ? 'text-rose-400'
                    : lastAuditStatus === 'clean'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                }`}
              >
                {lastAuditStatus === 'corrupted'
                  ? '🚨 Corrupted'
                  : lastAuditStatus === 'clean'
                    ? '🛡️ Verified Clean'
                    : 'Awaiting Audit'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-card-border/40 pt-4">
          <div className="text-xs text-text/60 leading-relaxed max-w-lg">
            Every photo is hashed with <strong className="text-text">BLAKE3</strong> and bound into
            a Merkle cryptographic root. Modifying any single bit triggers an instant vault-wide
            alarm.
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              onClick={handleSimulateAttack}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
              title="Test the instant tamper alarm by simulating 1 corrupted bit in memory"
            >
              <Zap className="h-3.5 w-3.5 text-rose-400" />
              Simulate 1-Bit Flip Attack
            </Button>

            <Button
              variant="primary"
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              {isAuditing ? 'Auditing Vault...' : 'Audit Vault Integrity'}
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
