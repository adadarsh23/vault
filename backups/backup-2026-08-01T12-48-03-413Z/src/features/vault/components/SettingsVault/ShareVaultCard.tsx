import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { Share2, Link, Check, X } from 'lucide-react';
import {
  FaSquareFacebook,
  FaSquareXTwitter,
  FaLinkedin,
  FaWhatsapp,
  FaTelegram,
  FaReddit,
  FaEnvelope,
  FaDiscord,
  FaPinterest,
  FaTiktok,
  FaMessage,
} from 'react-icons/fa6';
import { QRCodeSVG } from 'qrcode.react';
import { SectionCard } from './SharedComponents';
import { toast } from 'sonner';
import { SETTINGS_PANEL } from './Utils';

const LIGHT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" ry="8" fill="#ffffff" stroke="#e5e7eb" stroke-width="1" />
  <g fill="none" stroke="#111111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(4, 4)">
    <rect width="16" height="10" x="4" y="11" rx="2" ry="2"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
  </g>
</svg>`;

const DARK_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" ry="8" fill="#18181b" stroke="#27272a" stroke-width="1" />
  <g fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(4, 4)">
    <rect width="16" height="10" x="4" y="11" rx="2" ry="2"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
  </g>
</svg>`;

const QR_LOGO_RATIO = 0.22;

const getQrLogoSettings = (qrSize: number, isDark: boolean) => {
  const logoSize = Math.round(qrSize * QR_LOGO_RATIO);
  const svg = isDark ? DARK_LOGO_SVG : LIGHT_LOGO_SVG;
  const src =
    typeof window !== 'undefined'
      ? `data:image/svg+xml;base64,${window.btoa(svg)}`
      : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return {
    src,
    height: logoSize,
    width: logoSize,
    excavate: true,
  };
};

export const ShareVaultCard: React.FC = memo(() => {
  const [copied, setCopied] = useState(false);
  const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setResolvedTheme(isDark ? 'dark' : 'light');
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const shareTitle = 'Vault - Secure, end-to-end encrypted storage for your digital assets.';
  const compactQrLogoSettings = useMemo(
    () => getQrLogoSettings(200, resolvedTheme === 'dark'),
    [resolvedTheme]
  );
  const previewQrLogoSettings = useMemo(
    () => getQrLogoSettings(420, resolvedTheme === 'dark'),
    [resolvedTheme]
  );

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        toast.success('Link copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error('Failed to copy link');
      });
  }, [shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Vault',
          text: shareTitle,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error - typically silent for cancels
      }
    } else {
      handleCopyLink();
    }
  }, [shareTitle, shareUrl, handleCopyLink]);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const openQrPreview = useCallback(() => {
    setIsQrPreviewOpen(true);
  }, []);

  const closeQrPreview = useCallback(() => {
    setIsQrPreviewOpen(false);
  }, []);

  useEffect(() => {
    if (!isQrPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeQrPreview();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isQrPreviewOpen, closeQrPreview]);

  const shareLinks = useMemo(() => {
    const cleanTitle = shareTitle.trim();
    const cleanUrl = shareUrl.trim();

    const encodedTitle = encodeURIComponent(cleanTitle);
    const encodedUrl = encodeURIComponent(cleanUrl);
    const encodedCombined = encodeURIComponent(`${cleanTitle} ${cleanUrl}`);

    return [
      {
        id: 'twitter',
        name: 'X (Twitter)',
        icon: FaSquareXTwitter,
        href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
        hoverClass: 'hover:text-black dark:hover:text-white hover:scale-110',
        ariaLabel: 'Share on X (Twitter)',
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        icon: FaWhatsapp,
        href: `https://wa.me/?text=${encodedCombined}`,
        hoverClass: 'hover:text-[#25D366] hover:scale-110',
        ariaLabel: 'Share on WhatsApp',
      },
      {
        id: 'facebook',
        name: 'Facebook',
        icon: FaSquareFacebook,
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        hoverClass: 'hover:text-[#1877F2] hover:scale-110',
        ariaLabel: 'Share on Facebook',
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: FaLinkedin,
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        hoverClass: 'hover:text-[#0A66C2] hover:scale-110',
        ariaLabel: 'Share on LinkedIn',
      },
      {
        id: 'telegram',
        name: 'Telegram',
        icon: FaTelegram,
        href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
        hoverClass: 'hover:text-[#24A1DE] hover:scale-110',
        ariaLabel: 'Share on Telegram',
      },
      {
        id: 'reddit',
        name: 'Reddit',
        icon: FaReddit,
        href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
        hoverClass: 'hover:text-[#FF4500] hover:scale-110',
        ariaLabel: 'Share on Reddit',
      },
      {
        id: 'discord',
        name: 'Discord',
        icon: FaDiscord,
        href: `https://discord.com/channels/@me`,
        hoverClass: 'hover:text-[#5865F2] hover:scale-110',
        ariaLabel: 'Share on Discord',
      },
      {
        id: 'sms',
        name: 'SMS',
        icon: FaMessage,
        href: `sms:?body=${encodedCombined}`,
        hoverClass: 'hover:text-green-500 hover:scale-110',
        ariaLabel: 'Share via SMS',
      },
      {
        id: 'pinterest',
        name: 'Pinterest',
        icon: FaPinterest,
        href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`,
        hoverClass: 'hover:text-[#E60023] hover:scale-110',
        ariaLabel: 'Share on Pinterest',
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        icon: FaTiktok,
        href: `https://www.tiktok.com/upload?lang=en`,
        hoverClass: 'hover:text-pink-500 hover:scale-110',
        ariaLabel: 'Share on TikTok',
      },
      {
        id: 'email',
        name: 'Email',
        icon: FaEnvelope,
        href: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(
          `Check out Vault:\n\n${cleanUrl}`
        )}`,
        hoverClass: 'hover:text-muted-foreground hover:scale-110',
        ariaLabel: 'Share via Email',
      },
    ] as const;
  }, [shareTitle, shareUrl]);

  return (
    <SectionCard
      title="Share Vault"
      description="Help others secure their digital identity by sharing Vault with your network. Spread the word about privacy-focused encryption."
    >
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* URL Copy Card */}
        <div className={`${SETTINGS_PANEL} flex flex-col justify-between gap-4 overflow-hidden`}>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text/40">
              Direct Link
            </p>
            <div className="flex items-center gap-2 overflow-hidden rounded-lg bg-text/5 p-2 transition-colors focus-within:ring-1 focus-within:ring-text/20 hover:bg-text/10">
              <code className="flex-1 truncate font-mono text-xs text-text/70">{shareUrl}</code>
              <button
                onClick={handleCopyLink}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-text/10 text-text transition-all hover:bg-text hover:text-bg focus:outline-none focus:ring-2 focus:ring-text/20"
                title="Copy Link"
                aria-label="Copy direct link to clipboard"
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Link className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <p className="text-xs text-text/30">Copy the URL to share anywhere manually.</p>
        </div>

        {/* QR Code Card */}
        <div
          className={`${SETTINGS_PANEL} flex flex-col items-center justify-between gap-4 text-center overflow-hidden`}
        >
          <div className="w-full space-y-4">
            <p className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-text/40">
              Visual Access
            </p>
            <button
              type="button"
              onClick={openQrPreview}
              className="mx-auto flex aspect-square w-full max-w-[160px] cursor-zoom-in items-center justify-center rounded-2xl border border-card-border bg-card-bg p-3 shadow-xl transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-text/30 sm:max-w-[180px]"
              aria-label="Open full size QR code"
            >
              <QRCodeSVG
                value={shareUrl}
                size={200}
                level="H"
                includeMargin={false}
                className="h-full w-full"
                fgColor="var(--text)"
                bgColor="transparent"
                imageSettings={compactQrLogoSettings}
              />
            </button>
          </div>
          <p className="text-xs text-text/30">
            Scan with any mobile device to open Vault immediately.
          </p>
        </div>

        {/* Social Share Buttons */}
        <div
          className={`${SETTINGS_PANEL} flex flex-col justify-between gap-4 md:col-span-2 lg:col-span-1`}
        >
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text/40">
              Social Platforms
            </p>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 sm:gap-3 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">
              {canNativeShare && (
                <button
                  onClick={handleNativeShare}
                  className="group relative flex aspect-square w-full items-center justify-center rounded-full bg-text text-bg transition-all hover:scale-110 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-text/40"
                  title="System Share"
                  aria-label="Share via system menu"
                >
                  <Share2
                    className="h-4 w-4 transition-transform group-hover:scale-110 sm:h-5 sm:w-5"
                    aria-hidden="true"
                  />
                  <span className="pointer-events-none absolute -bottom-9 left-1/2 z-20 -translate-x-1/2 scale-0 rounded bg-text px-2 py-1 text-[10px] text-bg shadow-md transition-all group-hover:scale-100 group-focus:scale-100 whitespace-nowrap">
                    System Share
                  </span>
                </button>
              )}
              {shareLinks.map((platform) => (
                <a
                  key={platform.name}
                  href={platform.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group relative flex aspect-square w-full items-center justify-center rounded-full bg-text/5 text-text/60 transition-all hover:bg-text/10 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-text/20 ${platform.hoverClass}`}
                  title={`Share on ${platform.name}`}
                  aria-label={`Share on ${platform.name}`}
                >
                  <platform.icon
                    className="h-4 w-4 transition-transform group-hover:scale-110 sm:h-5 sm:w-5"
                    aria-hidden="true"
                  />
                  <span className="pointer-events-none absolute -bottom-9 left-1/2 z-20 -translate-x-1/2 scale-0 rounded bg-text px-2 py-1 text-[10px] text-bg shadow-md transition-all group-hover:scale-100 group-focus:scale-100 whitespace-nowrap">
                    {platform.name}
                  </span>
                </a>
              ))}
            </div>
          </div>
          <p className="text-xs text-text/30">Connect and share with your network.</p>
        </div>
      </div>

      {isQrPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Full size QR code"
          onClick={closeQrPreview}
        >
          <div
            className="relative flex w-full max-w-[min(92vw,520px)] flex-col items-center gap-4 rounded-2xl border border-white/10 bg-bg p-4 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeQrPreview}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-text/10 text-text/70 transition-colors hover:bg-text hover:text-bg focus:outline-none focus:ring-2 focus:ring-text/30"
              aria-label="Close QR code preview"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="mt-8 flex aspect-square w-full max-w-[min(76vw,420px)] items-center justify-center rounded-2xl border border-card-border bg-card-bg p-4 sm:mt-6 sm:p-6">
              <QRCodeSVG
                value={shareUrl}
                size={420}
                level="H"
                includeMargin={false}
                className="h-full w-full"
                fgColor="var(--text)"
                bgColor="transparent"
                imageSettings={previewQrLogoSettings}
              />
            </div>
            <p className="max-w-sm text-center text-xs text-text/45">
              Scan this QR code to open Vault on another device.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
});

ShareVaultCard.displayName = 'ShareVaultCard';
