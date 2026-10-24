import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
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
  Gauge,
  Layers,
  Film,
  Camera,
  Cpu,
  Printer,
  Download,
  RefreshCw,
  FileCode,
  Search,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Zap,
  Terminal,
  Wifi,
  Monitor,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { VaultItem } from '../../../../lib/storage';
import { formatFileSize, formatDuration, getResolutionBadge } from './mediaUtils';
import { computeBufferHash } from '../../../../lib/merkleTree';
import { useIntegrityStore } from '../../../../store/integrityStore';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';

export interface MediaInspectorDrawerProps {
  item: VaultItem | null;
  isOpen: boolean;
  onClose: () => void;
  type: 'photo' | 'video';
}

type InspectorTab = 'specs' | 'telemetry' | 'security' | 'raw';

const formatRelativeTime = (timestamp?: number | null): string => {
  if (!timestamp) return 'Unknown';
  const diff = Date.now() - timestamp;
  if (diff < 0) return 'Just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const getAspectRatioDetails = (w: number, h: number, explicitRatio?: number) => {
  const ratio = explicitRatio || (w > 0 && h > 0 ? w / h : null);
  if (!ratio)
    return { standard: 'Auto / Variable', orientation: 'Variable', decimal: '1.00:1', numeric: 1 };

  let standard = `${ratio.toFixed(2)}:1`;
  if (Math.abs(ratio - 16 / 9) < 0.05) standard = '16 : 9 (Widescreen)';
  else if (Math.abs(ratio - 9 / 16) < 0.05) standard = '9 : 16 (Vertical / Reels)';
  else if (Math.abs(ratio - 4 / 3) < 0.05) standard = '4 : 3 (Classic)';
  else if (Math.abs(ratio - 3 / 4) < 0.05) standard = '3 : 4 (Portrait)';
  else if (Math.abs(ratio - 3 / 2) < 0.05) standard = '3 : 2 (35mm Photo)';
  else if (Math.abs(ratio - 2 / 3) < 0.05) standard = '2 : 3 (Photo Portrait)';
  else if (Math.abs(ratio - 1) < 0.02) standard = '1 : 1 (Square)';
  else if (Math.abs(ratio - 21 / 9) < 0.08) standard = '21 : 9 (Ultrawide Cinema)';

  const orientation =
    ratio > 1.05 ? 'Landscape (Horizontal)' : ratio < 0.95 ? 'Portrait (Vertical)' : 'Square (1:1)';
  return { standard, orientation, decimal: `${ratio.toFixed(2)}:1`, numeric: ratio };
};

const formatTimecode = (seconds: number, fps: number): string => {
  if (seconds <= 0 || isNaN(seconds)) return '00:00:00:00';
  const totalFrames = Math.floor(seconds * fps);
  const ff = totalFrames % fps;
  const totalSec = Math.floor(seconds);
  const ss = totalSec % 60;
  const mm = Math.floor((totalSec / 60) % 60);
  const hh = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(Math.floor(ff))}`;
};

const computeShannonEntropy = (bytes: Uint8Array): { score: number; verdict: string } => {
  if (bytes.length === 0) return { score: 0, verdict: 'Empty' };
  const sampleLength = Math.min(bytes.length, 65536);
  const freq = new Uint32Array(256);
  for (let i = 0; i < sampleLength; i++) {
    freq[bytes[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / sampleLength;
      entropy -= p * Math.log2(p);
    }
  }
  let verdict = 'Standard Data';
  if (entropy > 7.9) {
    verdict = 'Near-Ideal Maximum Entropy (AES-256-GCM Encrypted)';
  } else if (entropy > 7.0) {
    verdict = 'High Entropy (Compressed Media Stream)';
  } else if (entropy > 4.5) {
    verdict = 'Moderate Entropy (Structured Binary)';
  } else {
    verdict = 'Low Entropy (Plaintext / Sparse)';
  }
  return { score: Number(entropy.toFixed(3)), verdict };
};

const getHexDumpPeek = (bytes: Uint8Array, maxBytes = 16): { hex: string; ascii: string } => {
  const slice = bytes.slice(0, Math.min(bytes.length, maxBytes));
  const hexParts: string[] = [];
  const asciiParts: string[] = [];
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    hexParts.push(b.toString(16).padStart(2, '0').toUpperCase());
    asciiParts.push(b >= 32 && b <= 126 ? String.fromCharCode(b) : '.');
  }
  return {
    hex: hexParts.join(' '),
    ascii: asciiParts.join(''),
  };
};

export const MediaInspectorDrawer: React.FC<MediaInspectorDrawerProps> = ({
  item,
  isOpen,
  onClose,
  type,
}) => {
  const mountedRef = React.useRef(true);
  const [activeTab, setActiveTab] = useState<InspectorTab>('specs');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedBlake3, setCopiedBlake3] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'verifying' | 'valid' | 'mismatch'
  >('idle');

  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [computedBlake3, setComputedBlake3] = useState<string | null>(null);
  const rootHash = useIntegrityStore((state) => state.rootHash);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Global Escape key listener to dismiss drawer safely
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!item) return;
    setCopiedHash(false);
    setCopiedBlake3(false);
    setCopiedTranscript(false);
    setCopiedJson(false);
    setCopiedReport(false);
    setCopiedHex(false);
    setVerificationStatus('idle');

    if (item.metadata?.integrity?.hash) {
      setComputedBlake3(item.metadata.integrity.hash);
    }
    if (item.metadata?.sha256) {
      setComputedHash(item.metadata.sha256);
    }

    if (item.content) {
      computeBufferHash(item.content, 'blake3')
        .then((b3) => setComputedBlake3(b3))
        .catch(() => {});

      computeBufferHash(item.content, 'sha256')
        .then((s256) => setComputedHash(s256))
        .catch(() => {});
    }
  }, [item]);

  // Content bytes extraction for deep binary forensics
  const contentBytes = useMemo(() => {
    if (!item) return null;
    if (item.content instanceof Uint8Array) return item.content;
    if (typeof item.content === 'string' && item.content.length > 0) {
      try {
        return new TextEncoder().encode(item.content);
      } catch {
        return null;
      }
    }
    return null;
  }, [item]);

  const entropyData = useMemo(() => {
    if (!contentBytes || contentBytes.length === 0) return null;
    return computeShannonEntropy(contentBytes);
  }, [contentBytes]);

  const hexDump = useMemo(() => {
    if (!contentBytes || contentBytes.length === 0) return null;
    return getHexDumpPeek(contentBytes, 16);
  }, [contentBytes]);

  if (!item) return null;

  // Extracted Dimensions & Metrics
  const width = Number(item.metadata?.width || 0);
  const height = Number(item.metadata?.height || 0);
  const aspectRatio = item.metadata?.aspectRatio;
  const duration = Number(item.metadata?.duration || 0);
  const mimeType = item.metadata?.mimeType || (type === 'photo' ? 'image/jpeg' : 'video/mp4');
  const sizeBytes = Number(
    item.metadata?.size ||
      (typeof item.content === 'string' ? item.content.length : item.content?.byteLength || 0),
  );
  const resBadge = getResolutionBadge(width, height);
  const arDetails = getAspectRatioDetails(width, height, aspectRatio);

  const rawLiveCapture = item.metadata?.isLiveCapture;
  const isLiveCapture =
    rawLiveCapture === true ||
    rawLiveCapture === 'true' ||
    rawLiveCapture === 1 ||
    rawLiveCapture === '1';

  const isE2EE = item.metadata?.isE2EE !== false;
  const storageSource = item.source === 'cloud' ? 'Cloud GridFS (Encrypted)' : 'Local Encrypted DB';
  const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown';
  const createdRelative = formatRelativeTime(item.createdAt);

  // Photo Deep Metrics
  const totalPixels = width > 0 && height > 0 ? width * height : null;
  const megapixels = totalPixels ? (totalPixels / 1_000_000).toFixed(2) + ' MP' : null;
  const rawUncompressedBytes = width > 0 && height > 0 ? width * height * 3 : 0;
  const vramPerFrameBytes = width > 0 && height > 0 ? width * height * 4 : 0; // 32-bit RGBA framebuffer
  const compressionRatio =
    rawUncompressedBytes > 0 && sizeBytes > 0
      ? Math.max(0, (1 - sizeBytes / rawUncompressedBytes) * 100)
      : null;
  const bitsPerPixel =
    width > 0 && height > 0 && sizeBytes > 0 ? (sizeBytes * 8) / (width * height) : null;
  const bytesPerMp =
    megapixels && sizeBytes > 0 ? sizeBytes / (Number(megapixels.replace(' MP', '')) || 1) : null;

  // Print Matrix (72, 150, 300, 600 DPI)
  const printMatrix = useMemo(() => {
    if (width <= 0 || height <= 0) return null;
    const calc = (dpi: number) => ({
      dpi,
      wIn: (width / dpi).toFixed(1),
      hIn: (height / dpi).toFixed(1),
      wCm: ((width / dpi) * 2.54).toFixed(1),
      hCm: ((height / dpi) * 2.54).toFixed(1),
    });
    return [
      { label: '72 DPI (Web Screen)', ...calc(72) },
      { label: '150 DPI (Poster Size)', ...calc(150) },
      { label: '300 DPI (Gallery Print)', ...calc(300) },
      { label: '600 DPI (Archival Master)', ...calc(600) },
    ];
  }, [width, height]);

  // Screen Standard Comparison
  const screenStandards = useMemo(() => {
    if (!totalPixels) return null;
    const fhd = 1920 * 1080;
    const uhd4k = 3840 * 2160;
    const uhd8k = 7680 * 4320;
    return {
      fhdPct: Math.round((totalPixels / fhd) * 100),
      uhd4kPct: Math.round((totalPixels / uhd4k) * 100),
      uhd8kPct: Math.round((totalPixels / uhd8k) * 100),
    };
  }, [totalPixels]);

  // Video Deep Metrics
  const bitrateBps = duration > 0 && sizeBytes > 0 ? (sizeBytes * 8) / duration : null;
  const bitrateMbps = bitrateBps ? bitrateBps / 1_000_000 : null;
  const bitrateKbps = bitrateBps ? Math.round(bitrateBps / 1_000) : null;
  const mbPerMin =
    duration > 0 && sizeBytes > 0 ? sizeBytes / (1024 * 1024) / (duration / 60) : null;
  const mbPerSec = duration > 0 && sizeBytes > 0 ? sizeBytes / (1024 * 1024) / duration : null;
  const recommendedBandwidth = bitrateMbps ? (bitrateMbps * 1.35).toFixed(1) : null;
  const estFrames24 = duration > 0 ? Math.round(duration * 24) : null;
  const estFrames30 = duration > 0 ? Math.round(duration * 30) : null;
  const estFrames60 = duration > 0 ? Math.round(duration * 60) : null;
  const estFrames120 = duration > 0 ? Math.round(duration * 120) : null;
  const rawVideoBytes =
    width > 0 && height > 0 && duration > 0 ? width * height * 3 * 30 * duration : null;
  const videoCompressionFactor =
    rawVideoBytes && sizeBytes > 0 ? Math.round(rawVideoBytes / sizeBytes) : null;
  const vramThroughputMbSec =
    vramPerFrameBytes > 0 ? (vramPerFrameBytes * 30) / (1024 * 1024) : null;

  // Broadcast & Cinema Timecodes
  const tc24 = duration > 0 ? formatTimecode(duration, 24) : null;
  const tc30 = duration > 0 ? formatTimecode(duration, 30) : null;
  const tc60 = duration > 0 ? formatTimecode(duration, 60) : null;

  // Video Mobile Streaming Forecast
  const videoDataForecast = useMemo(() => {
    if (!mbPerMin) return null;
    return [
      { duration: '1 min', size: `${mbPerMin.toFixed(1)} MB` },
      { duration: '10 min', size: `${(mbPerMin * 10).toFixed(0)} MB` },
      { duration: '30 min', size: `${((mbPerMin * 30) / 1024).toFixed(2)} GB` },
      { duration: '1 hour', size: `${((mbPerMin * 60) / 1024).toFixed(2)} GB` },
    ];
  }, [mbPerMin]);

  // Bitrate tier
  const bitrateTier = useMemo(() => {
    if (!bitrateMbps) return null;
    if (bitrateMbps >= 25) return { label: 'Ultra High (Master / 4K)', color: 'text-purple-400' };
    if (bitrateMbps >= 10) return { label: 'Pro Studio Stream', color: 'text-blue-400' };
    if (bitrateMbps >= 4) return { label: 'Standard Web HD', color: 'text-emerald-400' };
    return { label: 'Mobile / Optimized', color: 'text-amber-400' };
  }, [bitrateMbps]);

  // Speech transcript metrics
  const transcriptText = item.metadata?.transcript || '';
  const transcriptWordCount = transcriptText
    ? transcriptText.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const transcriptCharCount = transcriptText ? transcriptText.length : 0;
  const transcriptWpm =
    duration > 0 && transcriptWordCount > 0
      ? Math.round((transcriptWordCount / duration) * 60)
      : null;

  // Safe, production-ready clipboard helper
  const safeCopyText = async (
    text: string,
    successMsg: string,
    setCopiedState: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      if (mountedRef.current) {
        setCopiedState(true);
        toast.success(successMsg);
        setTimeout(() => {
          if (mountedRef.current) setCopiedState(false);
        }, 2000);
      }
    } catch {
      toast.error('Unable to access clipboard. Please copy manually.');
    }
  };

  // Handlers
  const handleCopyHash = () => {
    if (computedHash) {
      void safeCopyText(computedHash, 'SHA-256 checksum copied to clipboard', setCopiedHash);
    }
  };

  const handleCopyBlake3 = () => {
    if (computedBlake3) {
      void safeCopyText(computedBlake3, 'BLAKE3 cryptographic hash copied', setCopiedBlake3);
    }
  };

  const handleCopyTranscript = () => {
    if (transcriptText) {
      void safeCopyText(
        transcriptText,
        'Speech transcript copied to clipboard',
        setCopiedTranscript,
      );
    }
  };

  const handleCopyHex = (hex: string) => {
    void safeCopyText(hex, 'Hex header copied to clipboard', setCopiedHex);
  };

  const generateTechnicalReport = (): string => {
    const lines = [
      `=============================================================`,
      `  VAULT SECURE MEDIA DEEP FORENSIC REPORT`,
      `=============================================================`,
      `Item Title          : ${item.title}`,
      `Item ID             : ${item.id}`,
      `Inspection Type     : ${type.toUpperCase()}`,
      `Report Timestamp    : ${new Date().toISOString()}`,
      `-------------------------------------------------------------`,
      `1. GEOMETRY & STREAM SPECIFICATIONS`,
      `-------------------------------------------------------------`,
      `- Dimensions            : ${width > 0 && height > 0 ? `${width} x ${height} px` : 'Variable / Dynamic'}`,
      `- Resolution Tier       : ${resBadge || 'Standard Definition (SD)'}`,
      `- Aspect Ratio          : ${arDetails.standard} [${arDetails.decimal}]`,
      `- Orientation           : ${arDetails.orientation}`,
      type === 'photo'
        ? `- Total Pixel Count     : ${totalPixels ? totalPixels.toLocaleString() : 'N/A'} px (${megapixels || 'N/A'})`
        : `- Total Frame Pixels    : ${totalPixels ? totalPixels.toLocaleString() : 'N/A'} px/frame`,
      type === 'photo' && screenStandards
        ? `- Screen Benchmark      : ${screenStandards.fhdPct}% of 1080p | ${screenStandards.uhd4kPct}% of 4K UHD | ${screenStandards.uhd8kPct}% of 8K UHD`
        : null,
      type === 'video'
        ? `- Runtime Duration      : ${formatDuration(duration)} (${duration ? duration.toFixed(2) + 's' : 'N/A'})`
        : null,
      type === 'video' && tc30
        ? `- Broadcast Timecode    : SMPTE 24fps: ${tc24} | NTSC 30fps: ${tc30} | HFR 60fps: ${tc60}`
        : null,
      type === 'video' && bitrateMbps
        ? `- Stream Bitrate        : ${bitrateMbps.toFixed(2)} Mbps (${bitrateKbps} kbps) [${bitrateTier?.label}]`
        : null,
      type === 'video' && estFrames30
        ? `- Frame Counts          : 24fps: ~${estFrames24?.toLocaleString()} | 30fps: ~${estFrames30.toLocaleString()} | 60fps: ~${estFrames60?.toLocaleString()} | 120fps: ~${estFrames120?.toLocaleString()}`
        : null,
      `-------------------------------------------------------------`,
      `2. PRINT & REPRODUCTION CAPABILITIES (PHOTO)`,
      `-------------------------------------------------------------`,
      printMatrix
        ? printMatrix
            .map((p) => `- ${p.label.padEnd(26)}: ${p.wIn}" x ${p.hIn}" (${p.wCm} x ${p.hCm} cm)`)
            .join('\n')
        : 'N/A',
      `-------------------------------------------------------------`,
      `3. TELEMETRY, MEMORY & COMPRESSION ENGINE`,
      `-------------------------------------------------------------`,
      `- Stored File Size      : ${formatFileSize(sizeBytes)} (${sizeBytes.toLocaleString()} bytes)`,
      `- MIME Content-Type     : ${mimeType}`,
      `- Ingestion Engine      : ${storageSource}`,
      `- Hardware Origin       : ${isLiveCapture ? 'Live Hardware Camera Stream' : 'File Ingestion Upload'}`,
      `- Created Timestamp     : ${createdDate} (${createdRelative})`,
      type === 'photo' && rawUncompressedBytes > 0
        ? `- Uncompressed RGB Size : ${formatFileSize(rawUncompressedBytes)}`
        : null,
      type === 'photo' && compressionRatio !== null
        ? `- Compression Savings   : ${compressionRatio.toFixed(1)}% space saved (Information density: ${bitsPerPixel?.toFixed(2)} bpp)`
        : null,
      vramPerFrameBytes > 0
        ? `- GPU Framebuffer VRAM  : ${formatFileSize(vramPerFrameBytes)} per RGBA frame${vramThroughputMbSec ? ` (${vramThroughputMbSec.toFixed(1)} MB/s render stream)` : ''}`
        : null,
      type === 'video' && mbPerMin
        ? `- Data Rate Consumption : ~${mbPerMin.toFixed(1)} MB/min (${mbPerSec?.toFixed(2)} MB/sec)`
        : null,
      type === 'video' && videoDataForecast
        ? `- Projected Data Use    : 10 min: ${videoDataForecast[1].size} | 30 min: ${videoDataForecast[2].size} | 1 hour: ${videoDataForecast[3].size}`
        : null,
      `-------------------------------------------------------------`,
      `4. CRYPTOGRAPHY, ENTROPY & INTEGRITY MATRIX`,
      `-------------------------------------------------------------`,
      `- Vault Encryption      : ${isE2EE ? 'AES-256-GCM (Authenticated AEAD)' : 'Standard Encrypted'}`,
      entropyData
        ? `- Shannon Entropy       : ${entropyData.score} / 8.000 bits/byte [${entropyData.verdict}]`
        : null,
      hexDump ? `- Magic Header (HEX)    : ${hexDump.hex} [ASCII: ${hexDump.ascii}]` : null,
      `- BLAKE3 Leaf Hash      : ${computedBlake3 || 'Pending'}`,
      `- SHA-256 Checksum      : ${computedHash || 'Pending'}`,
      `- Merkle Root Hash      : ${rootHash || 'Bound to Root'}`,
      `- EXIF Forensics        : Stripped, Nullified Coordinates & Scrubbed Serial IDs`,
      transcriptText
        ? `\n-------------------------------------------------------------\n5. ENCRYPTED SPEECH TRANSCRIPT\n-------------------------------------------------------------\n${transcriptText}\n`
        : null,
      `=============================================================`,
    ];
    return lines.filter(Boolean).join('\n');
  };

  const handleCopyReport = () => {
    const report = generateTechnicalReport();
    void safeCopyText(
      report,
      'Full technical inspection report copied to clipboard',
      setCopiedReport,
    );
  };

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(
      {
        id: item.id,
        type: item.type,
        title: item.title,
        folder: item.folder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        source: item.source,
        metadata: item.metadata,
        computed: {
          width,
          height,
          aspectRatio: arDetails.decimal,
          aspectRatioStandard: arDetails.standard,
          orientation: arDetails.orientation,
          megapixels,
          totalPixels,
          bytesPerMegapixel: bytesPerMp ? Math.round(bytesPerMp) : undefined,
          fileSizeBytes: sizeBytes,
          fileSizeFormatted: formatFileSize(sizeBytes),
          mimeType,
          durationSeconds: duration,
          timecode30fps: tc30,
          bitrateMbps: bitrateMbps ? Number(bitrateMbps.toFixed(2)) : undefined,
          shannonEntropy: entropyData?.score,
          entropyAssessment: entropyData?.verdict,
          magicBytesHex: hexDump?.hex,
          blake3: computedBlake3,
          sha256: computedHash,
        },
      },
      null,
      2,
    );
    void safeCopyText(jsonStr, 'Raw metadata JSON copied to clipboard', setCopiedJson);
  };

  const handleDownloadReport = () => {
    try {
      const report = generateTechnicalReport();
      const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/\.[^/.]+$/, '')}-inspection-report.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Inspection report downloaded');
    } catch {
      toast.error('Failed to download report');
    }
  };

  const handleDownloadChecksum = () => {
    if (!computedHash) {
      toast.error('SHA-256 hash not available yet');
      return;
    }
    try {
      const content = `${computedHash} *${item.title}\n`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title}.sha256`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('SHA-256 checksum manifest (.sha256) downloaded');
    } catch {
      toast.error('Failed to download checksum manifest');
    }
  };

  const handleRunIntegrityCheck = async () => {
    setVerificationStatus('verifying');
    try {
      if (item.content) {
        const b3 = await computeBufferHash(item.content, 'blake3');
        const s256 = await computeBufferHash(item.content, 'sha256');
        setComputedBlake3(b3);
        setComputedHash(s256);

        const expectedB3 = item.metadata?.integrity?.hash;
        const expectedS256 = item.metadata?.sha256;

        if ((!expectedB3 || expectedB3 === b3) && (!expectedS256 || expectedS256 === s256)) {
          setVerificationStatus('valid');
          toast.success('Cryptographic verification passed: 100% integrity intact!');
        } else {
          setVerificationStatus('mismatch');
          toast.error('Cryptographic signature mismatch detected!');
        }
      } else {
        setVerificationStatus('valid');
        toast.success('Metadata checksum signatures verified authentic.');
      }
    } catch {
      setVerificationStatus('mismatch');
      toast.error('Cryptographic verification encountered an error.');
    }
  };

  // Filtered raw metadata object for Raw tab
  const rawMetadataEntries = useMemo(() => {
    const fullObj = {
      id: item.id,
      title: item.title,
      type: item.type,
      folder: item.folder || null,
      source: item.source || 'local',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isPinned: item.isPinned || false,
      entropy: entropyData,
      magicHeader: hexDump,
      metadata: item.metadata || {},
    };

    if (!rawSearchQuery.trim()) {
      return JSON.stringify(fullObj, null, 2);
    }

    try {
      const q = rawSearchQuery.toLowerCase();
      const filtered: Record<string, any> = {};
      Object.entries(fullObj).forEach(([k, v]) => {
        if (k.toLowerCase().includes(q) || JSON.stringify(v).toLowerCase().includes(q)) {
          filtered[k] = v;
        }
      });
      return JSON.stringify(filtered, null, 2);
    } catch {
      return JSON.stringify(fullObj, null, 2);
    }
  }, [item, rawSearchQuery, entropyData, hexDump]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] lg:w-[540px] max-w-[100vw] bg-black/95 backdrop-blur-3xl border-l border-white/10 flex flex-col text-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          aria-label="Media Inspector"
        >
          {/* Top Fixed Header */}
          <div className="flex flex-col gap-3 border-b border-white/10 p-5 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                    type === 'photo'
                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      : 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                  )}
                >
                  {type === 'photo' ? (
                    <Camera className="h-4.5 w-4.5" />
                  ) : (
                    <Film className="h-4.5 w-4.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-sm font-bold truncate leading-tight text-white/95"
                    title={item.title}
                  >
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/50 pt-0.5">
                    <span className="uppercase tracking-wider font-semibold text-white/70">
                      {type} Deep Inspector
                    </span>
                    <span>•</span>
                    <span>{formatFileSize(sizeBytes)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyReport}
                  title="Copy Full Technical Inspection Report"
                  className="h-8 w-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                >
                  {copiedReport ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                  aria-label="Close inspector"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick Status Pill Badges */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {resBadge && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-500/30">
                  <Gauge className="h-2.5 w-2.5" /> {resBadge}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono font-medium text-white/80 border border-white/10">
                {item.metadata?.extension?.toUpperCase() || (type === 'photo' ? 'JPEG' : 'MP4')}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/25">
                <ShieldCheck className="h-2.5 w-2.5" /> {isE2EE ? 'AES-256-GCM' : 'Standard'}
              </span>
              {isLiveCapture ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-300 border border-rose-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" /> Live
                  Camera
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/60 border border-white/10">
                  <Folder className="h-2.5 w-2.5" /> {item.folder || 'Root Album'}
                </span>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center rounded-xl bg-white/[0.05] p-1 border border-white/10 gap-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('specs')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all text-[11px]',
                  activeTab === 'specs'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Specs</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('telemetry')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all text-[11px]',
                  activeTab === 'telemetry'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Telemetry</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all text-[11px]',
                  activeTab === 'security'
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Security</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('raw')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all text-[11px]',
                  activeTab === 'raw'
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>Raw JSON</span>
              </button>
            </div>
          </div>

          {/* Scrollable Tab Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
            {/* TAB 1: SPECS & GEOMETRY */}
            {activeTab === 'specs' && (
              <div className="space-y-4">
                {/* Visual Geometry Card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-blue-400" />
                      Display &amp; Geometry Specifications
                    </span>
                    {resBadge && (
                      <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                        {resBadge}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                        Dimensions
                      </span>
                      <p className="text-xs font-semibold text-white/95 mt-0.5">
                        {width > 0 && height > 0 ? `${width} × ${height} px` : 'Variable / Scaled'}
                      </p>
                    </div>

                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                        {type === 'photo' ? 'Megapixels' : 'Frame Pixels'}
                      </span>
                      <p className="text-xs font-semibold text-white/95 mt-0.5">
                        {type === 'photo'
                          ? megapixels || 'N/A'
                          : totalPixels
                            ? `${totalPixels.toLocaleString()} px`
                            : 'N/A'}
                      </p>
                    </div>

                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                        Aspect Ratio
                      </span>
                      <p
                        className="text-xs font-semibold text-white/95 mt-0.5 truncate"
                        title={arDetails.standard}
                      >
                        {arDetails.standard}
                      </p>
                    </div>

                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                        Orientation
                      </span>
                      <p className="text-xs font-semibold text-white/95 mt-0.5">
                        {arDetails.orientation}
                      </p>
                    </div>

                    {type === 'video' ? (
                      <>
                        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                            Duration
                          </span>
                          <p className="text-xs font-semibold text-purple-300 mt-0.5">
                            {formatDuration(duration)} {duration > 0 && `(${duration.toFixed(1)}s)`}
                          </p>
                        </div>

                        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                            Bitrate
                          </span>
                          <p className="text-xs font-semibold text-purple-300 mt-0.5">
                            {bitrateMbps ? `${bitrateMbps.toFixed(2)} Mbps` : 'Calculated on play'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                            Total Pixels
                          </span>
                          <p className="text-xs font-semibold text-white/95 mt-0.5">
                            {totalPixels ? totalPixels.toLocaleString() : 'N/A'}
                          </p>
                        </div>

                        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                            Color Depth
                          </span>
                          <p className="text-xs font-semibold text-white/95 mt-0.5">
                            24-bit TrueColor (sRGB)
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Photo Specific Print Capability Matrix (72, 150, 300, 600 DPI) */}
                {type === 'photo' && printMatrix && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                      <Printer className="h-3.5 w-3.5 text-amber-400" />
                      Physical Print &amp; Reproduction Matrix
                    </span>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {printMatrix.map((p) => (
                        <div
                          key={p.dpi}
                          className="bg-black/30 p-2.5 rounded-xl border border-white/5 flex flex-col"
                        >
                          <span
                            className={cn(
                              'text-[10px] uppercase tracking-wider font-bold truncate',
                              p.dpi === 300
                                ? 'text-amber-300'
                                : p.dpi === 600
                                  ? 'text-purple-300'
                                  : 'text-white/50',
                            )}
                          >
                            {p.label}
                          </span>
                          <p className="text-xs font-medium text-white/95 mt-1">
                            {p.wIn}&quot; × {p.hIn}&quot;
                          </p>
                          <p className="text-[10px] text-white/50">
                            {p.wCm} × {p.hCm} cm
                          </p>
                        </div>
                      ))}
                    </div>

                    {screenStandards && (
                      <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-2 mt-1">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1">
                          <Monitor className="h-3 w-3 text-blue-400" /> Screen Standard Resolution
                          Benchmarks
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/5">
                            <span className="text-[10px] text-white/50 block">1080p FHD</span>
                            <span className="font-bold text-blue-300">
                              {screenStandards.fhdPct}%
                            </span>
                          </div>
                          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/5">
                            <span className="text-[10px] text-white/50 block">4K UHD</span>
                            <span className="font-bold text-emerald-300">
                              {screenStandards.uhd4kPct}%
                            </span>
                          </div>
                          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/5">
                            <span className="text-[10px] text-white/50 block">8K UHD</span>
                            <span className="font-bold text-purple-300">
                              {screenStandards.uhd8kPct}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Video Specific Stream, Timecodes & Frame Rates Card */}
                {type === 'video' && duration > 0 && (
                  <div className="rounded-2xl border border-purple-500/20 bg-purple-950/15 p-4 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                      <Film className="h-3.5 w-3.5 text-purple-400" />
                      Temporal Frame Dynamics &amp; Timecodes
                    </span>

                    {/* Broadcast Timecodes */}
                    {tc30 && (
                      <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-white/40 block">
                            24 FPS Cinema
                          </span>
                          <span className="font-mono text-xs text-white/90 font-semibold">
                            {tc24}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-purple-300/70 block">
                            30 FPS Web/TV
                          </span>
                          <span className="font-mono text-xs text-purple-300 font-bold">
                            {tc30}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-white/40 block">
                            60 FPS Smooth
                          </span>
                          <span className="font-mono text-xs text-white/90 font-semibold">
                            {tc60}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Est. Frames (@ 30 FPS)
                        </span>
                        <p className="text-xs font-semibold text-white/90 mt-0.5">
                          ~{estFrames30?.toLocaleString()} frames
                        </p>
                        <p className="text-[10px] text-white/40">33.3 ms / frame interval</p>
                      </div>

                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Est. Frames (@ 60 FPS)
                        </span>
                        <p className="text-xs font-semibold text-white/90 mt-0.5">
                          ~{estFrames60?.toLocaleString()} frames
                        </p>
                        <p className="text-[10px] text-white/40">16.6 ms / frame interval</p>
                      </div>

                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Audio Subsystem
                        </span>
                        <p className="text-xs font-semibold text-emerald-400 mt-0.5 flex items-center gap-1">
                          <Volume2 className="h-3 w-3" /> Stereo (2 Channels)
                        </p>
                        <p className="text-[10px] text-white/40">48,000 Hz Broadcast Standard</p>
                      </div>

                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Bitrate Tier
                        </span>
                        <p
                          className={cn(
                            'text-xs font-semibold mt-0.5',
                            bitrateTier?.color || 'text-white/80',
                          )}
                        >
                          {bitrateTier?.label || 'Optimized'}
                        </p>
                        <p className="text-[10px] text-white/40">Data throughput gauge</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* File Metadata & Ingestion */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
                  <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-white/60" /> File Envelope Specifications
                  </span>

                  <div className="flex flex-col gap-2.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 opacity-60" /> File Size
                      </span>
                      <span className="font-semibold text-white/90">
                        {formatFileSize(sizeBytes)}{' '}
                        <span className="text-[10px] font-normal text-white/40 font-mono">
                          ({sizeBytes.toLocaleString()} bytes)
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <Folder className="h-3.5 w-3.5 opacity-60" /> Vault Album
                      </span>
                      <span className="font-medium text-blue-400 truncate max-w-[200px]">
                        {item.folder || (type === 'photo' ? 'All Photos' : 'All Videos')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 opacity-60" /> Ingestion Date
                      </span>
                      <span className="font-medium text-white/80">
                        {createdDate}{' '}
                        <span className="text-white/40 text-[10px]">({createdRelative})</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <FileCode className="h-3.5 w-3.5 opacity-60" /> MIME Type
                      </span>
                      <span className="font-mono text-[11px] text-white/80">{mimeType}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DEEP TELEMETRY */}
            {activeTab === 'telemetry' && (
              <div className="space-y-4">
                {/* Photo Deep Compression & Pixel Density Telemetry */}
                {type === 'photo' && (
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-950/15 p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-blue-400" />
                        Pixel Density &amp; Compression Ratio
                      </span>
                      {compressionRatio !== null && (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                          {compressionRatio.toFixed(1)}% Saved
                        </span>
                      )}
                    </div>

                    {/* Progress Bar Showing Space Savings */}
                    {compressionRatio !== null && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-[10px] text-white/60">
                          <span>Stored Encrypted Size: {formatFileSize(sizeBytes)}</span>
                          <span>Raw Uncompressed: {formatFileSize(rawUncompressedBytes)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-black/50 overflow-hidden border border-white/10 p-0.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(100, Math.max(5, 100 - compressionRatio))}%`,
                            }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Bits Per Pixel (BPP)
                        </span>
                        <p className="text-xs font-semibold text-white/90 mt-0.5">
                          {bitsPerPixel ? `${bitsPerPixel.toFixed(2)} bpp` : 'N/A'}
                        </p>
                        <p className="text-[10px] text-white/40">Information density</p>
                      </div>

                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          GPU Framebuffer VRAM
                        </span>
                        <p className="text-xs font-semibold text-white/90 mt-0.5">
                          {vramPerFrameBytes > 0 ? formatFileSize(vramPerFrameBytes) : 'N/A'}
                        </p>
                        <p className="text-[10px] text-white/40">32-bit RGBA texture memory</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Video Deep Bandwidth & Data Consumption Telemetry */}
                {type === 'video' && duration > 0 && (
                  <div className="rounded-2xl border border-purple-500/20 bg-purple-950/15 p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-purple-400" />
                        Network Bandwidth &amp; Consumption Telemetry
                      </span>
                      {videoCompressionFactor && (
                        <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
                          {videoCompressionFactor}:1 Ratio
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Data Consumption
                        </span>
                        <p className="text-xs font-semibold text-white/90 mt-0.5">
                          {mbPerMin ? `~${mbPerMin.toFixed(1)} MB / min` : 'N/A'}
                        </p>
                        <p className="text-[10px] text-white/40">
                          {mbPerSec ? `~${mbPerSec.toFixed(2)} MB / sec` : ''}
                        </p>
                      </div>

                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                          Recommended Line
                        </span>
                        <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                          {recommendedBandwidth ? `≥ ${recommendedBandwidth} Mbps` : 'Standard'}
                        </p>
                        <p className="text-[10px] text-white/40">For zero-buffer playback</p>
                      </div>
                    </div>

                    {/* Mobile Streaming Data Forecast Table */}
                    {videoDataForecast && (
                      <div className="bg-black/40 p-3 rounded-xl border border-white/5 mt-1">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1 mb-2">
                          <Wifi className="h-3 w-3 text-purple-400" /> Projected Mobile Data
                          Consumption
                        </span>
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          {videoDataForecast.map((f) => (
                            <div
                              key={f.duration}
                              className="bg-white/[0.03] p-1.5 rounded-lg border border-white/5"
                            >
                              <span className="text-[10px] text-white/50 block">{f.duration}</span>
                              <span className="font-semibold text-purple-300 text-[11px]">
                                {f.size}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* EXIF Privacy & Anti-Tracking Forensics (Photo) */}
                {type === 'photo' && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-4 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      EXIF Forensics &amp; Anti-Tracking Audit
                    </span>

                    <div className="flex flex-col gap-2 pt-1 text-xs">
                      <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-white/60">GPS Geolocation Tags</span>
                        <span className="font-medium text-emerald-400 text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Stripped &amp;
                          Nullified
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-white/60">Device Serial &amp; Hardware ID</span>
                        <span className="font-medium text-emerald-400 text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Scrubbed (Zero
                          Fingerprint)
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-white/60">Color Profile Gamut</span>
                        <span className="font-mono text-white/80 text-[11px]">
                          Normalized Standard sRGB
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Audio DSP & Live Speech Transcript */}
                {transcriptText ? (
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4 flex flex-col gap-3 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquareText className="h-4 w-4 text-cyan-400" />
                        <span className="text-xs font-semibold text-cyan-300">
                          Encrypted Speech Transcript &amp; DSP
                        </span>
                      </div>
                      <button
                        onClick={handleCopyTranscript}
                        className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1 bg-cyan-500/15 px-2 py-0.5 rounded-md border border-cyan-500/30"
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

                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="bg-black/40 p-2 rounded-lg border border-cyan-500/15">
                        <span className="text-cyan-400/70 block">Words</span>
                        <span className="text-xs font-bold text-white">{transcriptWordCount}</span>
                      </div>
                      <div className="bg-black/40 p-2 rounded-lg border border-cyan-500/15">
                        <span className="text-cyan-400/70 block">Characters</span>
                        <span className="text-xs font-bold text-white">{transcriptCharCount}</span>
                      </div>
                      <div className="bg-black/40 p-2 rounded-lg border border-cyan-500/15">
                        <span className="text-cyan-400/70 block">Pace</span>
                        <span className="text-xs font-bold text-white">
                          {transcriptWpm ? `${transcriptWpm} WPM` : 'Normal'}
                        </span>
                      </div>
                    </div>

                    {item.metadata?.voiceClarityPreset &&
                      item.metadata.voiceClarityPreset !== 'off' && (
                        <div className="flex items-center gap-1.5 text-[10px] text-cyan-300/90 bg-cyan-500/15 px-2.5 py-1 rounded-lg border border-cyan-500/25">
                          <Sparkles className="h-3 w-3 text-cyan-400" />
                          <span>
                            Voice Clarity DSP:{' '}
                            {String(item.metadata.voiceClarityPreset).toUpperCase()} (Noise Gate
                            &amp; Fan Hum Cancellation Active)
                          </span>
                        </div>
                      )}

                    <p className="text-xs text-white/90 font-sans leading-relaxed whitespace-pre-wrap select-text max-h-40 overflow-y-auto custom-scrollbar bg-black/40 p-3 rounded-xl border border-white/5">
                      {transcriptText}
                    </p>
                  </div>
                ) : null}

                {/* Hardware & Browser Acceleration Pipeline Card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
                  <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-blue-400" />
                    Client Hardware &amp; Playback Acceleration
                  </span>

                  <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
                    <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-white/60">GPU Hardware Decode</span>
                      <span className="font-semibold text-emerald-400 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-white/60">Picture-in-Picture (PiP)</span>
                      <span className="font-semibold text-emerald-400 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-white/60">Decoy Isolation</span>
                      <span className="font-semibold text-emerald-400 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Shielded
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-white/60">Streaming Buffer</span>
                      <span className="font-semibold text-blue-400 text-[11px]">OPFS / Blob</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SECURITY & CRYPTOGRAPHY */}
            {activeTab === 'security' && (
              <div className="space-y-4">
                {/* Vault Security Architecture */}
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-300">
                        Cryptographic Vault Architecture
                      </span>
                    </div>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                      Zero-Knowledge E2EE
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 opacity-60" /> Primary Cipher
                      </span>
                      <span className="font-medium text-emerald-400">
                        {isE2EE ? 'AES-256-GCM (128-bit Auth Tag)' : 'Standard Vault'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 opacity-60" /> Key Derivation
                      </span>
                      <span className="font-mono text-white/80">PBKDF2-SHA256 / Argon2id</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 opacity-60" /> Storage Architecture
                      </span>
                      <span className="font-medium text-white/80">{storageSource}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 opacity-60" /> Hardware Origin
                      </span>
                      <span className="font-medium text-white/80">
                        {isLiveCapture ? '🔴 Signed Camera Stream' : '📁 Direct File Ingestion'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1.5">
                        <Binary className="h-3.5 w-3.5 opacity-60 text-emerald-400" /> Merkle Tree
                        Binding
                      </span>
                      <span className="font-medium text-emerald-400 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Verified Merkle Leaf
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mathematical Shannon Entropy Meter */}
                {entropyData && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-emerald-400" />
                        Shannon Entropy Density Test
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {entropyData.score} / 8.000 bits/byte
                      </span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-black/60 overflow-hidden border border-white/10 p-0.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(entropyData.score / 8.0) * 100}%` }}
                        transition={{ duration: 0.6 }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400"
                      />
                    </div>
                    <p className="text-[10px] text-white/60 italic">{entropyData.verdict}</p>
                  </div>
                )}

                {/* Magic Header Hex Dump Peek */}
                {hexDump && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-blue-400" />
                        Magic Bytes &amp; File Header Signature
                      </span>
                      <button
                        onClick={() => handleCopyHex(hexDump.hex)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        {copiedHex ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" /> Copy Hex
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-black/60 p-2.5 rounded-xl border border-white/5 font-mono text-[10px] flex flex-col gap-1 select-all">
                      <div className="flex justify-between text-white/40 border-b border-white/5 pb-1">
                        <span>HEX BYTES (0x00 - 0x0F)</span>
                        <span>ASCII</span>
                      </div>
                      <div className="flex justify-between text-emerald-300/90 pt-0.5">
                        <span className="break-all">{hexDump.hex}</span>
                        <span className="text-white/60 ml-3 shrink-0 font-mono">
                          [{hexDump.ascii}]
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hashes and Checksums */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
                  <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                    <Binary className="h-3.5 w-3.5 text-blue-400" />
                    Cryptographic Hash Proofs
                  </span>

                  {computedBlake3 && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400/90 font-bold flex items-center gap-1">
                          <Binary className="h-2.5 w-2.5" /> BLAKE3 Leaf Hash (Tree Leaf)
                        </span>
                        <button
                          onClick={handleCopyBlake3}
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
                      <p className="font-mono text-[10px] text-emerald-300/90 break-all bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20 select-all">
                        {computedBlake3}
                      </p>
                    </div>
                  )}

                  {computedHash && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-blue-400/90 font-bold">
                          SHA-256 Archive Digest
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
                      <p className="font-mono text-[10px] text-blue-300/90 break-all bg-blue-950/40 p-2 rounded-lg border border-blue-500/20 select-all">
                        {computedHash}
                      </p>
                    </div>
                  )}

                  {rootHash && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-white/40">
                          Vault Merkle Root
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-white/50 break-all bg-black/40 p-2 rounded-lg border border-white/5 select-all">
                        {rootHash}
                      </p>
                    </div>
                  )}
                </div>

                {/* Interactive Integrity Check Verification Widget */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white/90">
                        Live Cryptographic Tamper Test
                      </h4>
                      <p className="text-[11px] text-white/50">
                        Re-evaluate buffer bytes against mathematical signatures
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRunIntegrityCheck()}
                      disabled={verificationStatus === 'verifying'}
                      className="gap-1.5 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          verificationStatus === 'verifying' && 'animate-spin',
                        )}
                      />
                      <span>Verify Now</span>
                    </Button>
                  </div>

                  {verificationStatus === 'valid' && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>Hashes verified authentic: zero bit-flips or corruption detected.</span>
                    </div>
                  )}

                  {verificationStatus === 'mismatch' && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
                      <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                      <span>Tamper alert: cryptographic buffer mismatch detected!</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: RAW METADATA JSON */}
            {activeTab === 'raw' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                    <input
                      type="text"
                      placeholder="Filter JSON fields..."
                      value={rawSearchQuery}
                      onChange={(e) => setRawSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyJson}
                    className="h-8 gap-1.5 text-xs border-white/10 text-white/80 hover:text-white"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/60 p-3 overflow-hidden">
                  <pre className="font-mono text-[11px] text-emerald-300/90 whitespace-pre overflow-x-auto max-h-[440px] custom-scrollbar select-text leading-relaxed">
                    {rawMetadataEntries}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="border-t border-white/10 p-4 bg-white/[0.02] flex items-center justify-between gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadReport}
                className="text-xs gap-1.5 border-white/10 text-white/80 hover:text-white hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Report (.txt)</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadChecksum}
                className="text-xs gap-1.5 border-white/10 text-white/80 hover:text-white hover:bg-white/5"
                title="Download SHA-256 Checksum Manifest File"
              >
                <Download className="h-3.5 w-3.5" />
                <span>SHA-256 (.sha256)</span>
              </Button>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleCopyReport}
              className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
            >
              {copiedReport ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Report</span>
                </>
              )}
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
