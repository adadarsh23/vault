import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QrCode,
  Lock,
  Copy,
  ExternalLink,
  Check,
  X,
  FileText,
  Wifi,
  Key,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { ScannedBarcodeResult, BarcodeContentType } from './types';
import { BarcodeScannerEngine } from './qrScannerEngine';
import { triggerHaptic } from './haptics';
import { toast } from 'sonner';

interface QRScannerOverlayProps {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSaveToNote: (result: ScannedBarcodeResult) => Promise<void>;
  isSavingNote?: boolean;
}

export const QRScannerOverlay: React.FC<QRScannerOverlayProps> = ({
  enabled,
  videoRef,
  onSaveToNote,
  isSavingNote = false,
}) => {
  const [currentResult, setCurrentResult] = useState<ScannedBarcodeResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const lastScannedValueRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const scannerRef = useRef<BarcodeScannerEngine | null>(null);

  useEffect(() => {
    if (!scannerRef.current) {
      scannerRef.current = new BarcodeScannerEngine();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCurrentResult(null);
      return;
    }

    let isScanningActive = true;
    let scanInterval: any = null;

    const performScan = async () => {
      if (!isScanningActive || !scannerRef.current || !videoRef.current) return;
      const res = await scannerRef.current.scanFrame(videoRef.current);
      if (res && res.rawValue) {
        const now = Date.now();
        // Debounce repeated triggers of the exact same code within 3 seconds
        if (
          res.rawValue !== lastScannedValueRef.current ||
          now - lastScannedTimeRef.current > 3000
        ) {
          lastScannedValueRef.current = res.rawValue;
          lastScannedTimeRef.current = now;
          setCurrentResult(res);
          setIsSaved(false);
          setIsCopied(false);
          triggerHaptic('success');

          if (autoSave) {
            void onSaveToNote(res).then(() => {
              setIsSaved(true);
              toast.success('Auto-saved to Encrypted Vault Note!');
            });
          }
        }
      }
    };

    scanInterval = setInterval(performScan, 250);

    return () => {
      isScanningActive = false;
      if (scanInterval) clearInterval(scanInterval);
    };
  }, [enabled, autoSave, onSaveToNote, videoRef]);

  const handleCopy = async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult.rawValue);
      setIsCopied(true);
      triggerHaptic('light');
      toast.success('Decoded text copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleSaveNote = async () => {
    if (!currentResult || isSavingNote || isSaved) return;
    triggerHaptic('medium');
    try {
      await onSaveToNote(currentResult);
      setIsSaved(true);
      triggerHaptic('success');
      toast.success('Saved to Encrypted Vault Note!');
    } catch {
      toast.error('Failed to save note to Vault');
    }
  };

  const getTypeIcon = (type: BarcodeContentType) => {
    switch (type) {
      case 'url':
        return <ExternalLink className="h-4 w-4 text-sky-400" />;
      case 'wifi':
        return <Wifi className="h-4 w-4 text-emerald-400" />;
      case 'otp':
      case 'secret':
        return <Key className="h-4 w-4 text-amber-400" />;
      default:
        return <FileText className="h-4 w-4 text-primary" />;
    }
  };

  if (!enabled) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col items-center justify-between p-4">
      {/* Top Scanner Reticle Line */}
      <div className="relative w-64 h-64 sm:w-72 sm:h-72 mt-12 rounded-3xl border-2 border-primary/40 flex items-center justify-center shadow-[0_0_30px_rgba(0,242,254,0.15)]">
        {/* Corner Accents */}
        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />

        {/* Animated Laser Scan Line */}
        <motion.div
          animate={{ y: [-110, 110, -110] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-full h-0.5 bg-linear-to-r from-transparent via-primary to-transparent shadow-[0_0_15px_rgba(0,242,254,0.9)]"
        />

        <span className="absolute bottom-2 text-[9px] font-black uppercase tracking-widest text-primary/70 bg-black/60 px-2 py-0.5 rounded-full border border-primary/20">
          Point at QR / Barcode
        </span>
      </div>

      {/* Detected Code Action Sheet */}
      <AnimatePresence>
        {currentResult && (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/20 bg-zinc-950/95 p-4 shadow-3xl backdrop-blur-2xl text-white mb-2"
          >
            {/* Header: Type, Title, and Close */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                  {getTypeIcon(currentResult.type)}
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white leading-tight truncate max-w-[200px] sm:max-w-[260px]">
                    {currentResult.title}
                  </h4>
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                    {currentResult.format.replace('_', ' ')} • {currentResult.type.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Auto-Save Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setAutoSave((prev) => !prev);
                    triggerHaptic('light');
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold border transition-all',
                    autoSave
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                  )}
                  title="Auto-save every scanned QR code directly into Vault"
                >
                  <Zap className="h-2.5 w-2.5" />
                  Auto-Save
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentResult(null)}
                  className="h-7 w-7 rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Decoded Content Preview */}
            <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 mb-3 max-h-20 overflow-y-auto font-mono text-[11px] text-white/80 select-text break-all leading-relaxed">
              {currentResult.rawValue}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Save to Vault Note (Primary Action) */}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveNote}
                disabled={isSavingNote || isSaved}
                className={cn(
                  'flex-1 h-9 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-lg',
                  isSaved
                    ? 'bg-emerald-500 text-black shadow-emerald-500/20'
                    : 'bg-primary text-black shadow-primary/20'
                )}
              >
                {isSaved ? (
                  <>
                    <Check className="h-3.5 w-3.5 stroke-[3px]" />
                    <span>Saved Note</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    <span>{isSavingNote ? 'Encrypting...' : 'Save Vault Note'}</span>
                  </>
                )}
              </Button>

              {/* Copy Text Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-xs flex items-center gap-1.5"
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-white/70" />
                )}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </Button>

              {/* Open Link (If URL) */}
              {currentResult.type === 'url' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(currentResult.rawValue, '_blank', 'noopener,noreferrer')}
                  className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sky-300 font-bold text-xs flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open</span>
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
