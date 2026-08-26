import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Binary,
  Copy,
  Check,
  RefreshCw,
  Zap,
  ShieldCheck,
  Database,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileWarning,
  ShieldAlert,
} from 'lucide-react';
import { SectionCard } from './SharedComponents';
import { Button } from '../../../../components/ui/Button';
import { useIntegrityStore } from '../../../../store/integrityStore';
import { useVaultStore } from '../../../../store/vaultStore';
import { toast } from 'sonner';
import { SETTINGS_PANEL, SETTINGS_PANEL_SOFT } from './Utils';

export const MerkleIntegrityCard: React.FC = memo(() => {
  const items = useVaultStore((state) => state.items);
  const rootHash = useIntegrityStore((state) => state.rootHash);
  const totalLeaves = useIntegrityStore((state) => state.totalLeaves);
  const treeDepth = useIntegrityStore((state) => state.treeDepth);
  const lastAuditAt = useIntegrityStore((state) => state.lastAuditAt);
  const lastAuditStatus = useIntegrityStore((state) => state.lastAuditStatus);
  const isAuditing = useIntegrityStore((state) => state.isAuditing);
  const corruptedItems = useIntegrityStore((state) => state.corruptedItems);
  const fetchIntegrityStatus = useIntegrityStore((state) => state.fetchIntegrityStatus);
  const rebuildLocalMerkleTree = useIntegrityStore((state) => state.rebuildLocalMerkleTree);
  const auditIntegrity = useIntegrityStore((state) => state.auditIntegrity);
  const simulateBitFlipAttack = useIntegrityStore((state) => state.simulateBitFlipAttack);

  const [copiedRoot, setCopiedRoot] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isSubscribed = true;
    const fetchStatus = async () => {
      try {
        await fetchIntegrityStatus();
      } catch {
        // Non-blocking fallback
      }
    };
    if (isSubscribed) {
      void fetchStatus();
    }
    return () => {
      isSubscribed = false;
    };
  }, [fetchIntegrityStatus]);

  useEffect(() => {
    let isSubscribed = true;
    if (items && items.length > 0) {
      const rebuild = async () => {
        try {
          await rebuildLocalMerkleTree(items);
        } catch {
          // Graceful fallback for corrupted items in tree
        }
      };
      if (isSubscribed) {
        void rebuild();
      }
    }
    return () => {
      isSubscribed = false;
    };
  }, [items, rebuildLocalMerkleTree]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyRoot = useCallback(async () => {
    const hashToCopy =
      rootHash || '0x0000000000000000000000000000000000000000000000000000000000000000';
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
        await navigator.clipboard.writeText(hashToCopy);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = hashToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedRoot(true);
      toast.success('Merkle Root copied to clipboard');
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedRoot(false);
      }, 2000);
    } catch {
      toast.error('Unable to copy Merkle Root to clipboard');
    }
  }, [rootHash]);

  const handleRunAudit = useCallback(async () => {
    try {
      await auditIntegrity();
    } catch {
      toast.error('Integrity audit encountered a network error.');
    }
  }, [auditIntegrity]);

  const handleSimulateAttack = useCallback(async () => {
    try {
      toast.info('Simulating 1-bit flip mutation in cloud storage payload...');
      await simulateBitFlipAttack();
    } catch {
      toast.error('Simulation failed.');
    }
  }, [simulateBitFlipAttack]);

  const displayRootHash =
    rootHash ||
    (items.length === 0
      ? '0x0000000000000000000000000000000000000000000000000000000000000000'
      : 'Computing cryptographic Merkle Root...');

  const boundAssetsCount = totalLeaves > 0 ? totalLeaves : items.length;
  const calculatedTreeDepth = items.length === 0 ? 0 : treeDepth > 0 ? treeDepth : 1;

  const formattedLastAudit = lastAuditAt
    ? new Date(lastAuditAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Pending Scan';

  const fullAuditDateTooltip = lastAuditAt
    ? `Last full verification: ${new Date(lastAuditAt).toLocaleString()}`
    : 'No audit run for current session';

  return (
    <SectionCard
      title="Merkle Tree Cryptographic Integrity"
      description="Protect photos and media against bit-flip attacks, bit-rot, and silent cloud storage tampering with BLAKE3 / SHA-512 domain-separated cryptographic chains."
    >
      <div
        className={`${SETTINGS_PANEL} space-y-5 sm:space-y-6 overflow-hidden`}
        role="region"
        aria-label="Merkle Tree Cryptographic Integrity"
      >
        {/* Merkle Root Header Card */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] dark:bg-emerald-950/10 p-3.5 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
                aria-hidden="true"
              >
                <Binary className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] sm:text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold truncate">
                  Active Cryptographic Merkle Root
                </span>
                <p className="text-xs sm:text-sm font-semibold text-text truncate">
                  RFC 6962 Domain-Separated Commitment
                </p>
              </div>
            </div>
          </div>

          {/* Root Hash Display Box */}
          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/5 dark:bg-black/50 p-2.5 sm:p-3 border border-card-border/60 dark:border-white/10 font-mono text-[11px] sm:text-xs">
            <span
              className="min-w-0 flex-1 truncate font-semibold text-emerald-600 dark:text-emerald-300 select-all"
              title={displayRootHash}
            >
              {displayRootHash}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyRoot}
              className="h-7 px-2 sm:px-2.5 text-[11px] sm:text-xs text-text/70 hover:text-text shrink-0"
              aria-label="Copy Merkle root hash to clipboard"
              title="Copy Merkle Root"
            >
              {copiedRoot ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 mr-1 shrink-0" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span>Copy Root</span>
                </>
              )}
            </Button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 pt-1">
            <div className="rounded-xl bg-card-bg/80 dark:bg-zinc-900/60 border border-card-border/60 dark:border-white/5 p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-text/50">
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold truncate">
                  Bound Assets
                </span>
              </div>
              <p className="text-sm sm:text-base font-bold text-text mt-1 truncate">
                {boundAssetsCount} {boundAssetsCount === 1 ? 'item' : 'items'}
              </p>
            </div>

            <div className="rounded-xl bg-card-bg/80 dark:bg-zinc-900/60 border border-card-border/60 dark:border-white/5 p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-text/50">
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold truncate">
                  Tree Depth
                </span>
              </div>
              <p className="text-sm sm:text-base font-bold text-text mt-1 truncate">
                {calculatedTreeDepth} {calculatedTreeDepth === 1 ? 'Level' : 'Levels'}
              </p>
            </div>

            <div
              className="rounded-xl bg-card-bg/80 dark:bg-zinc-900/60 border border-card-border/60 dark:border-white/5 p-3 min-w-0"
              title={fullAuditDateTooltip}
            >
              <div className="flex items-center gap-1.5 text-text/50">
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold truncate">
                  Last Audit
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-text mt-1 truncate">
                {formattedLastAudit}
              </p>
            </div>

            <div className="rounded-xl bg-card-bg/80 dark:bg-zinc-900/60 border border-card-border/60 dark:border-white/5 p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-text/50">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold truncate">
                  Audit Status
                </span>
              </div>
              <p
                className={`text-xs sm:text-sm font-bold mt-1 truncate flex items-center gap-1.5 ${
                  lastAuditStatus === 'corrupted'
                    ? 'text-rose-500 dark:text-rose-400'
                    : lastAuditStatus === 'clean'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-500 dark:text-amber-400'
                }`}
              >
                {lastAuditStatus === 'corrupted' ? (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    <span>🚨 Corrupted</span>
                  </>
                ) : lastAuditStatus === 'clean' ? (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>🛡️ Verified Clean</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <span>Awaiting Audit</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Corrupted Items Warning Banner if active */}
        {corruptedItems.length > 0 && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 sm:p-4 space-y-2.5 text-xs text-rose-300">
            <div className="flex items-center gap-2 font-bold text-rose-400 text-xs sm:text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 animate-pulse" />
              <span>Cryptographic Discrepancy Detected ({corruptedItems.length} affected)</span>
            </div>
            <p className="text-[11px] sm:text-xs leading-relaxed text-rose-200/90">
              One or more stored media items failed cryptographic verification against the Merkle
              Root. Re-running the audit or reviewing tampered assets is recommended.
            </p>
            <div className="space-y-1.5 pt-1">
              {corruptedItems.slice(0, 3).map((item, idx) => (
                <div
                  key={item.itemId || idx}
                  className="flex items-center justify-between gap-2 rounded-lg bg-black/20 p-2 text-[11px] font-mono"
                >
                  <span className="truncate flex items-center gap-1.5 text-zinc-200">
                    <FileWarning className="h-3 w-3 text-rose-400 shrink-0" />
                    {item.title}
                  </span>
                  <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] uppercase text-rose-300 shrink-0">
                    {item.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Cryptographic Specs Drawer */}
        <div className={`${SETTINGS_PANEL_SOFT} rounded-xl p-3 sm:p-4 space-y-3`}>
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="flex w-full items-center justify-between text-xs font-semibold text-text/70 hover:text-text transition-colors"
            aria-expanded={showDetails}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              Cryptographic Engine Specifications
            </span>
            {showDetails ? (
              <ChevronUp className="h-4 w-4 text-text/40" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text/40" />
            )}
          </button>

          {showDetails && (
            <div className="pt-2 border-t border-card-border/40 dark:border-white/5 space-y-2 text-[11px] sm:text-xs text-text/60 leading-relaxed animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg bg-black/5 dark:bg-black/30 p-2.5 space-y-1">
                  <p className="font-semibold text-text text-[11px]">
                    Domain Separation (RFC 6962)
                  </p>
                  <p className="text-[10px] text-text/50">
                    Leaves hashed with <code className="text-emerald-500">0x00</code> prefix,
                    intermediate nodes with <code className="text-emerald-500">0x01</code> to
                    prevent second-preimage collision attacks.
                  </p>
                </div>
                <div className="rounded-lg bg-black/5 dark:bg-black/30 p-2.5 space-y-1">
                  <p className="font-semibold text-text text-[11px]">Hardware Acceleration</p>
                  <p className="text-[10px] text-text/50">
                    BLAKE3 SIMD / WebAssembly parallel processing engine with fallback to WebCrypto
                    SHA-512 / SHA-256.
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-text/40 italic pt-1">
                Invariant: Every photo or file mutation triggers an immediate discrepancy alarm
                before cloud sync can propagate.
              </p>
            </div>
          )}
        </div>

        {/* Action Controls Footer */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-card-border/40 dark:border-white/10 pt-4">
          <div className="text-xs text-text/60 leading-relaxed max-w-lg">
            Every photo is hashed with <strong className="text-text font-semibold">BLAKE3</strong>{' '}
            and bound into a Merkle cryptographic root. Modifying any single bit triggers an instant
            vault-wide alarm.
          </div>

          <div className="flex flex-col min-[480px]:flex-row gap-2.5 w-full sm:w-auto shrink-0">
            <Button
              variant="secondary"
              onClick={handleSimulateAttack}
              disabled={isAuditing}
              className="flex items-center justify-center gap-1.5 text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 border-rose-500/30 hover:bg-rose-500/10 w-full min-[480px]:w-auto"
              title="Test the instant tamper alarm by simulating 1 corrupted bit in memory"
            >
              <Zap className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
              <span>Simulate 1-Bit Flip</span>
            </Button>

            <Button
              variant="primary"
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="flex items-center justify-center gap-1.5 text-xs w-full min-[480px]:w-auto"
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Auditing Vault...' : 'Audit Vault Integrity'}</span>
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
});

MerkleIntegrityCard.displayName = 'MerkleIntegrityCard';
