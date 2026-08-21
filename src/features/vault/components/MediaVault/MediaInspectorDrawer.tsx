import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Info,
  ShieldCheck,
  HardDrive,
  Clock,
  FileText,
  Copy,
  Check,
  Folder,
  Lock,
  Binary,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { VaultItem } from '../../../../lib/storage';
import { formatFileSize, formatDuration, getResolutionBadge } from './mediaUtils';
import { computeBufferHash } from '../../../../lib/merkleTree';
import { useIntegrityStore } from '../../../../store/integrityStore';
import { toast } from 'sonner';

interface MediaInspectorDrawerProps {
  item: VaultItem | null;
  isOpen: boolean;
  onClose: () => void;
  type: 'photo' | 'video';
}

export const MediaInspectorDrawer: React.FC<MediaInspectorDrawerProps> = ({
  item,
  isOpen,
  onClose,
  type,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedBlake3, setCopiedBlake3] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [computedBlake3, setComputedBlake3] = useState<string | null>(null);
  const rootHash = useIntegrityStore((state) => state.rootHash);

  useEffect(() => {
    if (!item) return;
    setCopiedHash(false);
    setCopiedBlake3(false);

    if (item.metadata?.integrity?.hash) {
      setComputedBlake3(item.metadata.integrity.hash);
    }
    if (item.metadata?.sha256) {
      setComputedHash(item.metadata.sha256);
    }

    if (item.content instanceof Uint8Array && item.content.byteLength > 0) {
      computeBufferHash(item.content, 'blake3')
        .then((b3) => setComputedBlake3(b3))
        .catch(() => {});

      computeBufferHash(item.content, 'sha256')
        .then((s256) => setComputedHash(s256))
        .catch(() => {});
    }
  }, [item]);

  if (!item) return null;

  const width = Number(item.metadata?.width || 0);
  const height = Number(item.metadata?.height || 0);
  const aspectRatio = item.metadata?.aspectRatio;
  const duration = item.metadata?.duration;
  const mimeType = item.metadata?.mimeType || (type === 'photo' ? 'image/jpeg' : 'video/mp4');
  const sizeBytes = Number(
    item.metadata?.size ||
      (typeof item.content === 'string' ? item.content.length : item.content?.byteLength || 0)
  );
  const resBadge = getResolutionBadge(width, height);

  const rawLiveCapture = item.metadata?.isLiveCapture;
  const isLiveCapture =
    rawLiveCapture === true ||
    rawLiveCapture === 'true' ||
    rawLiveCapture === 1 ||
    rawLiveCapture === '1';

  const isE2EE = item.metadata?.isE2EE !== false;
  const storageSource = item.source === 'cloud' ? 'Cloud GridFS (Encrypted)' : 'Local Encrypted DB';

  const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown';

  const megapixels =
    width > 0 && height > 0 ? ((width * height) / 1000000).toFixed(1) + ' MP' : null;

  const handleCopyHash = () => {
    if (computedHash) {
      void navigator.clipboard.writeText(computedHash);
      setCopiedHash(true);
      toast.success('SHA-256 checksum copied to clipboard');
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-96 max-w-[100vw] bg-black/85 backdrop-blur-2xl border-l border-white/10 p-6 flex flex-col gap-6 text-white shadow-2xl overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Info className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold truncate max-w-[200px]" title={item.title}>
                  {item.title}
                </h3>
                <span className="text-[10px] uppercase tracking-wider text-white/50">
                  {type} Inspector
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-white/60 hover:text-white hover:bg-white/10"
              aria-label="Close details"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Resolution & Dimensions Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/80">Display & Resolution</span>
              {resBadge && (
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                  {resBadge}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Dimensions
                </span>
                <p className="text-xs font-medium text-white/90">
                  {width > 0 && height > 0 ? `${width} × ${height}` : 'Variable / Scaled'}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Megapixels
                </span>
                <p className="text-xs font-medium text-white/90">{megapixels || 'N/A'}</p>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Aspect Ratio
                </span>
                <p className="text-xs font-medium text-white/90">
                  {typeof aspectRatio === 'number'
                    ? aspectRatio > 1.7 && aspectRatio < 1.8
                      ? '16 : 9'
                      : aspectRatio > 1.3 && aspectRatio < 1.4
                        ? '4 : 3'
                        : aspectRatio === 1
                          ? '1 : 1'
                          : `${aspectRatio.toFixed(2)} : 1`
                    : 'Auto'}
                </p>
              </div>

              {type === 'video' && duration ? (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Duration
                  </span>
                  <p className="text-xs font-medium text-white/90">{formatDuration(duration)}</p>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Format</span>
                  <p className="text-xs font-medium text-white/90 truncate">{mimeType}</p>
                </div>
              )}
            </div>
          </div>

          {/* File Specifications */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-white/80">File Metadata</span>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 opacity-60" /> File Size
                </span>
                <span className="font-semibold text-white/90">{formatFileSize(sizeBytes)}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 opacity-60" /> Album
                </span>
                <span className="font-medium text-blue-400 truncate max-w-[150px]">
                  {item.folder || (type === 'photo' ? 'All Photos' : 'All Videos')}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 opacity-60" /> Date Added
                </span>
                <span className="font-medium text-white/80">{createdDate}</span>
              </div>
            </div>
          </div>

          {/* Vault Security & Encryption Card */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">
                Vault Security Architecture
              </span>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 opacity-60" /> Encryption
                </span>
                <span className="font-medium text-emerald-400">
                  {isE2EE ? 'AES-256-GCM (E2EE)' : 'Standard Vault'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 opacity-60" /> Storage Mode
                </span>
                <span className="font-medium text-white/80">{storageSource}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 opacity-60" /> Origin
                </span>
                <span className="font-medium text-white/80">
                  {isLiveCapture ? '🔴 Live Camera Capture' : '📁 File Upload'}
                </span>
              </div>

              {type === 'photo' && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 opacity-60 text-emerald-400" /> EXIF &amp; GPS
                  </span>
                  <span className="font-medium text-emerald-400 text-[11px] flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-400" /> Sanitized (Anti-Tracking)
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Binary className="h-3.5 w-3.5 opacity-60 text-emerald-400" /> Merkle Tree
                </span>
                <span className="font-medium text-emerald-400 text-[11px] flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" /> Bound to Root
                </span>
              </div>

              {computedBlake3 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold flex items-center gap-1">
                      <Binary className="h-2.5 w-2.5" /> BLAKE3 Hash (Merkle Leaf)
                    </span>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(computedBlake3);
                        setCopiedBlake3(true);
                        toast.success('BLAKE3 cryptographic hash copied');
                        setTimeout(() => setCopiedBlake3(false), 2000);
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      {copiedBlake3 ? (
                        <>
                          <Check className="h-2.5 w-2.5 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-emerald-300/90 truncate bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-500/20 select-all">
                    {computedBlake3}
                  </p>
                </div>
              )}

              {rootHash && (
                <div className="flex flex-col gap-1 pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      Vault Merkle Root
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-white/50 truncate bg-black/40 p-1.5 rounded-lg border border-white/5 select-all">
                    {rootHash}
                  </p>
                </div>
              )}

              {computedHash && (
                <div className="flex flex-col gap-1 pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      SHA-256 Checksum
                    </span>
                    <button
                      onClick={handleCopyHash}
                      className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {copiedHash ? (
                        <>
                          <Check className="h-2.5 w-2.5 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-white/60 truncate bg-black/40 p-1.5 rounded-lg border border-white/5 select-all">
                    {computedHash}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 🎙️ Encrypted Speech Transcript & Audio DSP */}
          {item.metadata?.transcript && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4 flex flex-col gap-2.5 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-cyan-300">
                    Encrypted Live Transcript
                  </span>
                </div>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(item.metadata?.transcript);
                    setCopiedTranscript(true);
                    toast.success('Speech transcript copied to clipboard');
                    setTimeout(() => setCopiedTranscript(false), 2000);
                  }}
                  className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/30"
                >
                  {copiedTranscript ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
              </div>

              {item.metadata?.voiceClarityPreset && item.metadata.voiceClarityPreset !== 'off' && (
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-300/80 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 w-fit">
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  <span>Voice DSP: {String(item.metadata.voiceClarityPreset).toUpperCase()} (Fan & Hum Suppressed)</span>
                </div>
              )}

              <p className="text-xs text-white/85 font-sans leading-relaxed whitespace-pre-wrap select-text max-h-48 overflow-y-auto custom-scrollbar bg-black/40 p-2.5 rounded-xl border border-white/5">
                {item.metadata.transcript}
              </p>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
