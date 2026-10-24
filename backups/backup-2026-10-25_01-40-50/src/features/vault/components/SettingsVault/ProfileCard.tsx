import React from 'react';
import {
  HardDrive,
  Image,
  Video,
  Music,
  WalletCards,
  Shield,
  Smartphone,
  Wifi,
  X,
  Trash2,
  PieChart,
  Loader2,
  Upload,
  Crop,
  Edit3,
  Camera,
  Eye,
  Sparkles,
} from 'lucide-react';
import { SectionCard, StatCard } from './SharedComponents';
import {
  formatBytes,
  formatDate,
  formatCountLabel,
  SETTINGS_PANEL,
  SETTINGS_PANEL_SOFT,
} from './Utils';
import { type AuthenticatedProfile } from '../../../../lib/auth-api';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useLocation } from 'react-router-dom';
import { SmartAvatar } from '../../../../components/SmartAvatar';
import { useFastAvatar } from '../../../../hooks/useFastAvatar';

// Pure function — no React closure, safe to define outside component
const isValidProfilePhotoInput = (value: string): boolean => {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'none') {
    return true;
  }

  if (
    normalized.startsWith('data:image/') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('/') ||
    normalized.startsWith('./')
  ) {
    return true;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const getWordLetterInitials = (name?: string | null): string => {
  if (!name) return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';

  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  } else if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
  }
  return 'U';
};

interface ProfileCardProps {
  username: string | null;
  profile: AuthenticatedProfile | null;
  isSavingProfile: boolean;
  onSaveProfile: (
    profileName: string,
    profilePhoto: string,
  ) => Promise<{ saved: boolean; errorMessage?: string }>;
  syncHealthLabel: string;
  lastSuccessfulSyncAt: number | string | null | undefined;
  storageUsedBytes: number;
  itemCount: number;
  sessionsCount: number;
  mediaBreakdown?: {
    photo?: { count?: number; bytes?: number };
    video?: { count?: number; bytes?: number };
    audio?: { count?: number; bytes?: number };
    other?: { count?: number; bytes?: number };
  };
  onNavigate?: (tab: string) => void;
  openProfileEditorRequestToken?: number;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  username,
  profile,
  isSavingProfile,
  onSaveProfile,
  syncHealthLabel,
  lastSuccessfulSyncAt,
  storageUsedBytes,
  itemCount,
  sessionsCount,
  mediaBreakdown,
  onNavigate,
  openProfileEditorRequestToken,
}) => {
  const location = useLocation();

  const savedProfileName = (profile?.profileName || 'none').trim();
  const savedProfilePhoto = (profile?.profilePhoto || 'none').trim();
  const accountName = (
    (savedProfileName !== 'none' ? savedProfileName : '') ||
    username ||
    profile?.username ||
    'Unknown'
  ).trim();
  const hasProfilePhoto = savedProfilePhoto !== 'none' && savedProfilePhoto.length > 0;

  const [showProfilePopup, setShowProfilePopup] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<{
    src?: string;
    alt: string;
    isLetterAvatar?: boolean;
    initials?: string;
  } | null>(null);
  const [profileNameInput, setProfileNameInput] = React.useState(
    savedProfileName === 'none' ? '' : savedProfileName,
  );
  const [profilePhotoInput, setProfilePhotoInput] = React.useState(
    savedProfilePhoto === 'none' ? '' : savedProfilePhoto,
  );
  const [profileSaveError, setProfileSaveError] = React.useState<string | null>(null);
  const [isLocalLoading, setIsLocalLoading] = React.useState(false);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = React.useState<string | null>(null);
  const [showCropGuide, setShowCropGuide] = React.useState(true);

  const handleAvatarUploadSuccess = React.useCallback(
    async (avatarUrl: string) => {
      setSelectedFilePreviewUrl(null);
      setProfilePhotoInput(avatarUrl);
      setIsPopupImageBroken(false);
      setIsCardImageBroken(false);
      setProfileSaveError(null);
      setIsLocalLoading(false);
      const activeName = (
        profileNameInput.trim() || savedProfileName !== 'none'
          ? profileNameInput.trim() || savedProfileName
          : accountName
      ).trim();
      try {
        const result = await onSaveProfile(activeName || accountName, avatarUrl);
        if (result && !result.saved && result.errorMessage) {
          setProfileSaveError(result.errorMessage);
        }
      } catch (err: any) {
        setProfileSaveError(err?.message || 'Failed to save profile.');
      }
    },
    [onSaveProfile, profileNameInput, savedProfileName, accountName],
  );

  const handleAvatarUploadError = React.useCallback((_error: Error) => {
    setIsLocalLoading(false);
  }, []);

  const fastAvatar = useFastAvatar({
    userId: profile?.id || 'u_guest',
    initialAvatarUrl: hasProfilePhoto ? savedProfilePhoto : undefined,
    onUploadSuccess: handleAvatarUploadSuccess,
    onUploadError: handleAvatarUploadError,
  });

  const isAvatarBusy = fastAvatar.isProcessing || fastAvatar.isUploading || isLocalLoading;
  const isPhotoRemoved =
    profilePhotoInput.trim() === '' || profilePhotoInput.trim().toLowerCase() === 'none';

  const popupAccountName = (profileNameInput.trim() || accountName).trim();
  const wordLetterInitials = React.useMemo(
    () => getWordLetterInitials(popupAccountName),
    [popupAccountName],
  );
  const popupPhotoValue = profilePhotoInput.trim();

  const effectivePopupPhoto =
    isPhotoRemoved && !isAvatarBusy && !selectedFilePreviewUrl
      ? null
      : isAvatarBusy
        ? selectedFilePreviewUrl || fastAvatar.avatarUrl || popupPhotoValue
        : selectedFilePreviewUrl || popupPhotoValue;

  const handleFileSelect = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setProfileSaveError('Please select a valid image file.');
        return;
      }

      if (file.size > 35 * 1024 * 1024) {
        setProfileSaveError('Image file must be under 35MB.');
        return;
      }

      try {
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          const localUrl = URL.createObjectURL(file);
          setSelectedFilePreviewUrl(localUrl);
          setShowCropGuide(true);
        }
      } catch {
        // Ignore createObjectURL failure
      }

      setProfileSaveError(null);
      setIsLocalLoading(true);

      const fallbackToLocalFileReader = (fallbackFile: File) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const result = evt.target?.result;
          if (typeof result === 'string') {
            setProfilePhotoInput(result);
            setIsPopupImageBroken(false);
            setIsCardImageBroken(false);
            setProfileSaveError(null);
          }
          setIsLocalLoading(false);
        };
        reader.onerror = () => {
          setProfileSaveError('Failed to read the image file. Please try again.');
          setIsLocalLoading(false);
        };
        reader.readAsDataURL(fallbackFile);
      };

      try {
        await fastAvatar.processAndUploadAvatar(file);
        setIsLocalLoading(false);
      } catch {
        // If worker/cloud upload fails, gracefully fallback to client-side data URL
        fastAvatar.resetError();
        try {
          fallbackToLocalFileReader(file);
        } catch {
          setProfileSaveError('Failed to read the image file. Please try again.');
          setIsLocalLoading(false);
        }
      }
    },
    [fastAvatar],
  );

  // Memoize — avoids re-running URL parse on every render cycle
  const isPhotoInputValid = React.useMemo(
    () => isValidProfilePhotoInput(profilePhotoInput),
    [profilePhotoInput],
  );

  const [isCardImageBroken, setIsCardImageBroken] = React.useState(false);
  const [isPopupImageBroken, setIsPopupImageBroken] = React.useState(false);

  // Sync form inputs when persisted profile values change from outside
  React.useEffect(() => {
    setProfileNameInput(savedProfileName === 'none' ? '' : savedProfileName);
    setProfilePhotoInput(savedProfilePhoto === 'none' ? '' : savedProfilePhoto);
    setIsCardImageBroken(false);
    setIsPopupImageBroken(false);
  }, [savedProfileName, savedProfilePhoto]);

  // Reset broken-image flag whenever user changes the photo input
  React.useEffect(() => {
    setIsPopupImageBroken(false);
  }, [profilePhotoInput]);

  // Merged: open editor on hash change OR when a new external open-request token fires
  React.useEffect(() => {
    const shouldOpen =
      location.hash === '#edit-profile' ||
      (openProfileEditorRequestToken !== undefined && openProfileEditorRequestToken > 0);
    if (shouldOpen) {
      setShowProfilePopup(true);
      setProfileSaveError(null);
    }
  }, [location.hash, openProfileEditorRequestToken]);

  // Clean up object URL on unmount to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (
        selectedFilePreviewUrl &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        try {
          URL.revokeObjectURL(selectedFilePreviewUrl);
        } catch {
          // Ignore revocation error on unmount
        }
      }
    };
  }, [selectedFilePreviewUrl]);

  // Dismiss profile modal or enlarged preview on Escape key for standard accessibility
  React.useEffect(() => {
    if (!showProfilePopup && !previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
          return;
        }
        if (isAvatarBusy || isSavingProfile) return;
        setShowProfilePopup(false);
        setProfileSaveError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showProfilePopup, previewImage, isAvatarBusy, isSavingProfile]);

  const safeMediaBreakdown = React.useMemo(
    () => ({
      photo: {
        count: mediaBreakdown?.photo?.count || 0,
        bytes: mediaBreakdown?.photo?.bytes || 0,
      },
      video: {
        count: mediaBreakdown?.video?.count || 0,
        bytes: mediaBreakdown?.video?.bytes || 0,
      },
      audio: {
        count: mediaBreakdown?.audio?.count || 0,
        bytes: mediaBreakdown?.audio?.bytes || 0,
      },
      other: {
        count: mediaBreakdown?.other?.count || 0,
        bytes: mediaBreakdown?.other?.bytes || 0,
      },
    }),
    [mediaBreakdown],
  );

  const totalMediaBytes = React.useMemo(
    () =>
      safeMediaBreakdown.photo.bytes +
      safeMediaBreakdown.video.bytes +
      safeMediaBreakdown.audio.bytes +
      safeMediaBreakdown.other.bytes,
    [safeMediaBreakdown],
  );

  const totalMediaCount = React.useMemo(
    () =>
      safeMediaBreakdown.photo.count +
      safeMediaBreakdown.video.count +
      safeMediaBreakdown.audio.count +
      safeMediaBreakdown.other.count,
    [safeMediaBreakdown],
  );

  const photoPct =
    totalMediaBytes > 0 ? Math.round((safeMediaBreakdown.photo.bytes / totalMediaBytes) * 100) : 0;
  const videoPct =
    totalMediaBytes > 0 ? Math.round((safeMediaBreakdown.video.bytes / totalMediaBytes) * 100) : 0;
  const audioPct =
    totalMediaBytes > 0 ? Math.round((safeMediaBreakdown.audio.bytes / totalMediaBytes) * 100) : 0;
  const otherPct =
    totalMediaBytes > 0 ? Math.round((safeMediaBreakdown.other.bytes / totalMediaBytes) * 100) : 0;

  return (
    <SectionCard
      title="Vault Profile"
      description="A focused account snapshot with quick profile actions and expandable account details."
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-card-border bg-card-bg px-5 py-12 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.18)] transition-all duration-300 dark:border-white/10 dark:bg-black xs:px-6 xs:py-16 sm:px-8 sm:py-20 md:py-24 lg:py-28">
          {/* Ambient Top Glow */}
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl opacity-50 dark:from-white/10 dark:via-white/5"
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            {/* Centered Large Avatar with Perfect 1:1 Circle Geometry */}
            <div className="relative flex items-center justify-center">
              <button
                type="button"
                aria-label="View avatar preview"
                onClick={() => {
                  const effectiveCardPhoto =
                    fastAvatar.avatarUrl ||
                    (hasProfilePhoto && !isCardImageBroken ? savedProfilePhoto : null);
                  if (effectiveCardPhoto) {
                    setPreviewImage({
                      src: effectiveCardPhoto,
                      alt: `${accountName} profile preview`,
                    });
                  } else {
                    setPreviewImage({
                      alt: `${accountName} letter avatar preview`,
                      isLetterAvatar: true,
                      initials: wordLetterInitials,
                    });
                  }
                }}
                className="group/avatar relative flex h-[132px] w-[132px] min-h-[132px] min-w-[132px] max-h-[132px] max-w-[132px] shrink-0 aspect-square items-center justify-center rounded-full p-1.5 ring-2 ring-card-border/80 bg-card-bg shadow-2xl transition-all duration-300 hover:ring-primary/70 hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:ring-white/20 dark:bg-zinc-950 dark:hover:ring-white/50 cursor-pointer overflow-hidden"
                title="Click to view avatar preview"
              >
                <SmartAvatar
                  src={
                    fastAvatar.avatarUrl ||
                    (hasProfilePhoto && !isCardImageBroken ? savedProfilePhoto : null)
                  }
                  blurHash={fastAvatar.blurHash}
                  name={accountName}
                  size={120}
                  isProcessing={fastAvatar.isProcessing || isLocalLoading}
                  isUploading={fastAvatar.isUploading}
                  uploadProgress={fastAvatar.uploadProgress}
                  isOfflineQueued={fastAvatar.isOfflineQueued}
                  error={fastAvatar.error || profileSaveError}
                  className="shadow-inner pointer-events-none shrink-0 aspect-square rounded-full"
                />

                {/* Subtle hover overlay indicating click to preview */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity duration-200 group-hover/avatar:opacity-100 text-white backdrop-blur-[1px]"
                >
                  <Eye className="h-6 w-6 text-white drop-shadow-md mb-0.5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white drop-shadow">
                    Preview
                  </span>
                </div>
              </button>

              {/* Quick Camera Edit badge on Avatar to open profile editor */}
              <button
                type="button"
                aria-label="Open profile editor"
                onClick={() => setShowProfilePopup(true)}
                className="absolute bottom-0 right-0 sm:bottom-1 sm:right-1 z-10 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 sm:ring-[3px] ring-card-bg dark:ring-black transition-all duration-200 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                title="Open profile editor"
              >
                <Camera className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </button>
            </div>

            {/* Prominent Account Name */}
            <h3 className="mt-3 max-w-full break-words text-xl font-bold tracking-tight text-text xs:text-2xl sm:text-3xl lg:text-4xl leading-tight">
              {accountName}
            </h3>

            {/* Username Handle */}
            {username ? (
              <p className="mt-1 max-w-full break-words text-xs font-medium text-text/60 xs:text-sm sm:text-base dark:text-zinc-400">
                @{username}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2.5 sm:gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Account"
            value={accountName}
            hint={`User ID: ${profile?.id || 'Unavailable'}`}
            icon={Shield}
          />
          <StatCard
            label="Sync"
            value={syncHealthLabel}
            hint={`Last success: ${formatDate(lastSuccessfulSyncAt)}`}
            icon={Wifi}
          />
          <StatCard
            label="Storage"
            value={formatBytes(storageUsedBytes)}
            hint={`${itemCount} protected item${itemCount === 1 ? '' : 's'}`}
            icon={HardDrive}
          />
          <StatCard
            label="Devices"
            value={sessionsCount}
            hint={`Last profile update: ${formatDate(profile?.profileDetails?.updatedAt || profile?.updatedAt)}`}
            icon={Smartphone}
          />
        </div>

        <div className="grid gap-2.5 sm:gap-3 min-[480px]:grid-cols-2 xl:grid-cols-3">
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Username
            </p>
            <p className="mt-2 truncate text-base font-semibold text-text">
              {username ? `@${username}` : 'Unknown'}
            </p>
            <p className="mt-1 text-xs text-text/45 truncate">
              {profile?.username ? `@${profile.username}` : 'Secure vault account'}
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Display Name
            </p>
            <p className="mt-2 truncate text-base font-semibold text-text">
              {profile?.profileName?.trim() || accountName || 'Not configured'}
            </p>
            <p className="mt-1 text-xs text-text/45 truncate">
              Custom profile alias visible across vault
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              User ID
            </p>
            <p className="mt-2 break-all text-xs font-medium text-text/75">
              {profile?.id || 'Unavailable'}
            </p>
            <p className="mt-1 text-xs text-text/45">
              Permanent account identifier for this vault profile
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Two-Factor Auth
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {profile?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
            </p>
            <p className="mt-1 text-xs text-text/45 truncate">
              {profile?.twoFactorEnabled
                ? 'Multi-factor authentication active'
                : 'Multi-factor verification inactive'}
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Active Sessions
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatCountLabel(sessionsCount || profile?.sessions?.length || 1, 'session')}
            </p>
            <p className="mt-1 text-xs text-text/45 truncate">
              Authorized devices with active access tokens
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Sync Status
            </p>
            <p className="mt-2 text-sm font-semibold text-text">{syncHealthLabel}</p>
            <p className="mt-1 text-xs text-text/45 truncate">
              {lastSuccessfulSyncAt || profile?.meta?.lastSyncAt
                ? `Last synced: ${formatDate(lastSuccessfulSyncAt || profile?.meta?.lastSyncAt)}`
                : 'Cloud synchronization heartbeat'}
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Protected Items
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatCountLabel(itemCount, 'item')}
            </p>
            <p className="mt-1 text-xs text-text/45">
              Total encrypted records in this vault profile
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Storage Usage
            </p>
            <p className="mt-2 text-sm font-semibold text-text">{formatBytes(storageUsedBytes)}</p>
            <p className="mt-1 text-xs text-text/45 truncate">
              Total encrypted payload across all items
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Security Protocol
            </p>
            <p className="mt-2 text-sm font-semibold text-text">AES-256-GCM</p>
            <p className="mt-1 text-xs text-text/45 truncate">
              Argon2id master key derivation & zero-knowledge
            </p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Last Login
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatDate(profile?.meta?.lastLoginAt)}
            </p>
            <p className="mt-1 text-xs text-text/45">Most recent authenticated access</p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Profile Created
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatDate(profile?.profileDetails?.createdAt || profile?.createdAt)}
            </p>
            <p className="mt-1 text-xs text-text/45">Initial profile save timestamp</p>
          </div>
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Profile Updated
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatDate(profile?.profileDetails?.updatedAt || profile?.updatedAt)}
            </p>
            <p className="mt-1 text-xs text-text/45">Latest profile change timestamp</p>
          </div>
        </div>

        <div className="mt-6 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/40">
              <PieChart className="h-3.5 w-3.5 text-blue-400" />
              Media & File Breakdown
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-text/45">
              <span>{formatCountLabel(totalMediaCount, 'item')}</span>
              <span className="text-text/20">•</span>
              <span className="font-semibold text-text/75">{formatBytes(totalMediaBytes)}</span>
            </div>
          </div>

          {/* Segmented Distribution Bar */}
          {totalMediaBytes > 0 && (
            <div className="flex h-2 w-full gap-1 overflow-hidden rounded-full border border-card-border/60 bg-text/5 p-0.5 dark:border-white/10 dark:bg-black/40">
              {photoPct > 0 && (
                <div
                  style={{ width: `${photoPct}%` }}
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  title={`Photos: ${formatBytes(safeMediaBreakdown.photo.bytes)} (${photoPct}%)`}
                />
              )}
              {videoPct > 0 && (
                <div
                  style={{ width: `${videoPct}%` }}
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  title={`Videos: ${formatBytes(safeMediaBreakdown.video.bytes)} (${videoPct}%)`}
                />
              )}
              {audioPct > 0 && (
                <div
                  style={{ width: `${audioPct}%` }}
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  title={`Audio: ${formatBytes(safeMediaBreakdown.audio.bytes)} (${audioPct}%)`}
                />
              )}
              {otherPct > 0 && (
                <div
                  style={{ width: `${otherPct}%` }}
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  title={`All Other: ${formatBytes(safeMediaBreakdown.other.bytes)} (${otherPct}%)`}
                />
              )}
            </div>
          )}

          <div className="grid gap-2.5 sm:gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
            {/* Photos */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`View Photos (${safeMediaBreakdown.photo.count} files, ${formatBytes(safeMediaBreakdown.photo.bytes)})`}
              onClick={() => onNavigate?.('photos')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigate?.('photos');
                }
              }}
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 cursor-pointer overflow-hidden p-3.5 transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:bg-black/30 sm:p-4`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 mb-2.5 flex items-center justify-between gap-2 sm:mb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400 transition-transform duration-300 group-hover:scale-105">
                    <Image className="h-4 w-4" />
                  </div>
                  <p className="truncate text-xs font-semibold text-text/70 transition-colors group-hover:text-text">
                    Photos
                  </p>
                </div>
                {totalMediaBytes > 0 && (
                  <span className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400">
                    {photoPct}%
                  </span>
                )}
              </div>
              <div className="relative z-10 flex items-baseline gap-1.5">
                <p className="text-lg font-bold tracking-tight text-text sm:text-xl">
                  {safeMediaBreakdown.photo.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {safeMediaBreakdown.photo.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(safeMediaBreakdown.photo.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (safeMediaBreakdown.photo.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Videos */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`View Videos (${safeMediaBreakdown.video.count} files, ${formatBytes(safeMediaBreakdown.video.bytes)})`}
              onClick={() => onNavigate?.('videos')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigate?.('videos');
                }
              }}
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 cursor-pointer overflow-hidden p-3.5 transition-all duration-300 hover:border-purple-500/30 hover:bg-purple-500/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 dark:bg-black/30 sm:p-4`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 mb-2.5 flex items-center justify-between gap-2 sm:mb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400 transition-transform duration-300 group-hover:scale-105">
                    <Video className="h-4 w-4" />
                  </div>
                  <p className="truncate text-xs font-semibold text-text/70 transition-colors group-hover:text-text">
                    Videos
                  </p>
                </div>
                {totalMediaBytes > 0 && (
                  <span className="shrink-0 rounded-md border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-400">
                    {videoPct}%
                  </span>
                )}
              </div>
              <div className="relative z-10 flex items-baseline gap-1.5">
                <p className="text-lg font-bold tracking-tight text-text sm:text-xl">
                  {safeMediaBreakdown.video.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {safeMediaBreakdown.video.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(safeMediaBreakdown.video.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-purple-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (safeMediaBreakdown.video.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Audio */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`View Audio (${safeMediaBreakdown.audio.count} files, ${formatBytes(safeMediaBreakdown.audio.bytes)})`}
              onClick={() => onNavigate?.('audio')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigate?.('audio');
                }
              }}
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 cursor-pointer overflow-hidden p-3.5 transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:bg-black/30 sm:p-4`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 mb-2.5 flex items-center justify-between gap-2 sm:mb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 transition-transform duration-300 group-hover:scale-105">
                    <Music className="h-4 w-4" />
                  </div>
                  <p className="truncate text-xs font-semibold text-text/70 transition-colors group-hover:text-text">
                    Audio
                  </p>
                </div>
                {totalMediaBytes > 0 && (
                  <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {audioPct}%
                  </span>
                )}
              </div>
              <div className="relative z-10 flex items-baseline gap-1.5">
                <p className="text-lg font-bold tracking-tight text-text sm:text-xl">
                  {safeMediaBreakdown.audio.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {safeMediaBreakdown.audio.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(safeMediaBreakdown.audio.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (safeMediaBreakdown.audio.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* All Other */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`View All Other Files (${safeMediaBreakdown.other.count} files, ${formatBytes(safeMediaBreakdown.other.bytes)})`}
              onClick={() => onNavigate?.('files')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigate?.('files');
                }
              }}
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 cursor-pointer overflow-hidden p-3.5 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 dark:bg-black/30 sm:p-4`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 mb-2.5 flex items-center justify-between gap-2 sm:mb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 transition-transform duration-300 group-hover:scale-105">
                    <WalletCards className="h-4 w-4" />
                  </div>
                  <p className="truncate text-xs font-semibold text-text/70 transition-colors group-hover:text-text">
                    All Other
                  </p>
                </div>
                {totalMediaBytes > 0 && (
                  <span className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                    {otherPct}%
                  </span>
                )}
              </div>
              <div className="relative z-10 flex items-baseline gap-1.5">
                <p className="text-lg font-bold tracking-tight text-text sm:text-xl">
                  {safeMediaBreakdown.other.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {safeMediaBreakdown.other.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(safeMediaBreakdown.other.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-amber-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (safeMediaBreakdown.other.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {showProfilePopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-[2px]"
            onClick={() => {
              if (isAvatarBusy || isSavingProfile) return;
              setShowProfilePopup(false);
              setProfileSaveError(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-profile-title"
              className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-card-border bg-bg p-4 sm:p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] dark:bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="edit-profile-title" className="text-lg font-semibold text-text">
                    Edit Profile
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-text/50">
                    Update profile name and profile image URL.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close edit profile dialog"
                  disabled={isAvatarBusy || isSavingProfile}
                  onClick={() => {
                    setShowProfilePopup(false);
                    setProfileSaveError(null);
                  }}
                  className="rounded-lg p-1.5 text-text/50 transition-colors hover:bg-card-border/40 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-card-border/70 bg-card-bg/50 p-3">
                <div className="relative h-14 w-14 shrink-0 rounded-full overflow-hidden">
                  {effectivePopupPhoto && !isPopupImageBroken ? (
                    <button
                      type="button"
                      aria-label="Open popup profile image preview"
                      onClick={() =>
                        !isAvatarBusy &&
                        setPreviewImage({
                          src: effectivePopupPhoto,
                          alt: `${popupAccountName} profile preview`,
                        })
                      }
                      disabled={isAvatarBusy}
                      className={`h-full w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30 ${
                        isAvatarBusy ? 'cursor-wait pointer-events-none' : ''
                      }`}
                    >
                      <img
                        src={effectivePopupPhoto}
                        alt={popupAccountName}
                        loading="lazy"
                        decoding="async"
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-full object-cover"
                        onError={() => setIsPopupImageBroken(true)}
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Open letter avatar preview"
                      onClick={() =>
                        !isAvatarBusy &&
                        setPreviewImage({
                          alt: `${popupAccountName} letter avatar preview`,
                          isLetterAvatar: true,
                          initials: wordLetterInitials,
                        })
                      }
                      disabled={isAvatarBusy}
                      className={`h-full w-full rounded-full flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border border-white/10 text-white font-bold tracking-wider text-base uppercase shadow-inner transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer ${
                        isAvatarBusy ? 'cursor-wait pointer-events-none' : ''
                      }`}
                      title="Click to view letter avatar preview"
                    >
                      {wordLetterInitials}
                    </button>
                  )}

                  {/* Professional Loading Spinner & Progress Ring Overlay */}
                  {isAvatarBusy && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 backdrop-blur-[1px] text-white z-10 transition-opacity"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <div className="relative flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        {fastAvatar.uploadProgress > 0 && (
                          <span className="absolute text-[8px] font-bold text-white">
                            {`${Math.round(fastAvatar.uploadProgress)}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{popupAccountName}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <p className="truncate text-xs text-text/50">
                      {isAvatarBusy
                        ? fastAvatar.isUploading
                          ? 'Uploading photo...'
                          : 'Processing photo...'
                        : effectivePopupPhoto && !isPopupImageBroken
                          ? 'Profile photo preview'
                          : 'Letter avatar preview'}
                    </p>
                    {effectivePopupPhoto && !isPopupImageBroken && !isAvatarBusy && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            alt: `${popupAccountName} letter avatar preview`,
                            isLetterAvatar: true,
                            initials: wordLetterInitials,
                          })
                        }
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                        title="Preview letter avatar"
                      >
                        (Preview Letter)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Professional Circular Crop Framing Preview: Shows how much of the image will be visible in the circle */}
              {effectivePopupPhoto && !isPopupImageBroken && (
                <div className="mt-3 overflow-hidden rounded-xl border border-card-border/80 bg-card-bg/60 p-3 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                      <Crop className="h-3.5 w-3.5 text-primary" />
                      <span>Circle Crop Preview</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCropGuide((prev) => !prev)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {showCropGuide ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showCropGuide && (
                    <div className="mt-2.5 flex flex-col items-center">
                      {/* Image container with circular crop aperture boundary */}
                      <div className="relative inline-flex max-h-48 max-w-full items-center justify-center overflow-hidden rounded-lg bg-black/90 border border-white/10 shadow-inner">
                        <img
                          src={effectivePopupPhoto}
                          alt="Circle crop preview guide"
                          className="max-h-44 w-auto max-w-full object-contain block select-none"
                        />

                        {/* Circular Aperture Overlay: Dim everything outside the circle using box-shadow */}
                        <div
                          className="absolute inset-0 m-auto aspect-square max-h-full max-w-full rounded-full border-2 border-dashed border-primary ring-2 ring-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.68)] pointer-events-none"
                          aria-hidden="true"
                        >
                          {/* Center crosshair */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-30">
                            <div className="h-4 w-px bg-white" />
                            <div className="w-4 h-px bg-white absolute" />
                          </div>
                        </div>

                        {/* Active Upload / Processing Spinner on the Crop Guide */}
                        {isAvatarBusy && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[1px] text-white z-20">
                            <div className="relative flex items-center justify-center">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              {fastAvatar.uploadProgress > 0 && (
                                <span className="absolute text-[10px] font-bold text-white">
                                  {`${Math.round(fastAvatar.uploadProgress)}%`}
                                </span>
                              )}
                            </div>
                            <span className="mt-1.5 text-xs font-semibold text-white drop-shadow">
                              {fastAvatar.isUploading
                                ? `Uploading to circle... ${Math.round(fastAvatar.uploadProgress)}%`
                                : 'Processing circular crop...'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Legend / Key */}
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] font-medium text-text/60">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-primary ring-2 ring-primary/30" />
                          Inside circle (Visible)
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-zinc-600" />
                          Outside circle (Cropped out)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 grid gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/45">
                    Username (cannot be changed)
                  </p>
                  <Input
                    value={
                      username
                        ? `@${username}`
                        : profile?.username
                          ? `@${profile.username}`
                          : 'Unknown'
                    }
                    readOnly
                    disabled
                    aria-label="Username"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/45">
                    Display Name
                  </p>
                  <Input
                    value={profileNameInput}
                    onChange={(event) => {
                      setProfileNameInput(event.target.value);
                      if (profileSaveError) {
                        setProfileSaveError(null);
                      }
                    }}
                    placeholder="Enter display name"
                    maxLength={120}
                    disabled={isAvatarBusy || isSavingProfile}
                  />
                  <span className="sr-only">Display Name</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/45">
                      Profile Image URL / Data
                    </p>
                    <div className="flex items-center gap-3">
                      {profilePhotoInput.trim() &&
                      profilePhotoInput.trim().toLowerCase() !== 'none' ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedFilePreviewUrl) {
                              try {
                                URL.revokeObjectURL(selectedFilePreviewUrl);
                              } catch {
                                // Ignore cleanup error
                              }
                              setSelectedFilePreviewUrl(null);
                            }
                            setProfilePhotoInput('');
                            setIsPopupImageBroken(false);
                            if (profileSaveError) {
                              setProfileSaveError(null);
                            }
                          }}
                          disabled={isAvatarBusy || isSavingProfile}
                          className={`flex items-center gap-1 text-xs font-semibold text-red-500 transition-colors hover:underline ${
                            isAvatarBusy || isSavingProfile
                              ? 'opacity-50 cursor-not-allowed pointer-events-none'
                              : ''
                          }`}
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Remove</span>
                        </button>
                      ) : null}
                      <label
                        htmlFor="profile-photo-file-input"
                        className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
                          isAvatarBusy || isSavingProfile
                            ? 'opacity-50 cursor-not-allowed pointer-events-none text-text/40'
                            : 'cursor-pointer text-primary hover:underline'
                        }`}
                        aria-disabled={isAvatarBusy || isSavingProfile}
                      >
                        {isAvatarBusy ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>{fastAvatar.isUploading ? 'Uploading...' : 'Processing...'}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            <span>Upload Photo</span>
                          </>
                        )}
                      </label>
                      <input
                        id="profile-photo-file-input"
                        type="file"
                        accept="image/*"
                        disabled={isAvatarBusy || isSavingProfile}
                        className="hidden"
                        onClick={(e) => {
                          e.stopPropagation();
                          (e.target as HTMLInputElement).value = '';
                        }}
                        onChange={handleFileSelect}
                      />
                    </div>
                  </div>
                  <Input
                    value={profilePhotoInput}
                    onChange={(event) => {
                      setProfilePhotoInput(event.target.value);
                      if (profileSaveError) {
                        setProfileSaveError(null);
                      }
                    }}
                    placeholder="Enter HTTP/HTTPS URL or upload image (up to 35MB)"
                    maxLength={75000000}
                    aria-label="Profile Image URL or Data"
                    disabled={isAvatarBusy || isSavingProfile}
                  />
                </div>
                {!isPhotoInputValid ? (
                  <p className="text-xs text-red-500">
                    Please use a valid HTTP/HTTPS image URL or upload an image file, or leave it
                    blank.
                  </p>
                ) : null}
                {profileSaveError || fastAvatar.error ? (
                  <p className="text-xs text-red-500 font-medium">
                    Failed to save profile. {profileSaveError || fastAvatar.error}
                  </p>
                ) : null}
              </div>
              <div className="mt-5 flex flex-col-reverse min-[420px]:flex-row gap-2 sm:gap-3">
                <Button
                  variant="secondary"
                  loading={isSavingProfile || isAvatarBusy}
                  disabled={!isPhotoInputValid || isAvatarBusy}
                  className="w-full min-[420px]:w-auto justify-center"
                  onClick={async () => {
                    try {
                      const activeName = (
                        profileNameInput.trim() || savedProfileName !== 'none'
                          ? profileNameInput.trim() || savedProfileName
                          : accountName
                      ).trim();
                      const result = await onSaveProfile(
                        activeName || accountName,
                        profilePhotoInput.trim() || 'none',
                      );
                      if (result?.saved) {
                        setProfileSaveError(null);
                        setShowProfilePopup(false);
                        return;
                      }

                      setProfileSaveError(result?.errorMessage || 'Failed to save.');
                    } catch (err: any) {
                      setProfileSaveError(err?.message || 'Failed to save.');
                    }
                  }}
                >
                  Save Profile
                </Button>
                <Button
                  variant="ghost"
                  className="w-full min-[420px]:w-auto justify-center"
                  onClick={() => {
                    setProfileSaveError(null);
                    setShowProfilePopup(false);
                  }}
                  disabled={isSavingProfile || isAvatarBusy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {previewImage && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-md transition-all animate-in fade-in duration-200"
            onClick={() => setPreviewImage(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={
                previewImage.isLetterAvatar ? 'Letter avatar preview' : 'Avatar image preview'
              }
              className="relative w-full max-w-lg flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-zinc-950/90 p-5 sm:p-8 shadow-2xl backdrop-blur-xl max-h-[92vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Top-Right Accessible Close Button */}
              {/* <button
                type="button"
                aria-label="Close preview"
                onClick={() => setPreviewImage(null)}
                className="absolute right-3.5 top-3.5 z-10 inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button> */}

              {/* Header Badge with Icon */}
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 shadow-sm border border-white/10">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>
                  {previewImage.isLetterAvatar ? 'Letter Avatar Preview' : 'Avatar Photo Preview'}
                </span>
              </div>

              {previewImage.isLetterAvatar ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="flex h-40 w-40 xs:h-48 xs:w-48 sm:h-60 sm:w-60 items-center justify-center rounded-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border-4 border-white/20 text-white font-bold tracking-widest text-5xl sm:text-7xl uppercase shadow-[0_20px_50px_rgba(0,0,0,0.7)] ring-4 ring-primary/40 aspect-square shrink-0 select-none">
                    {previewImage.initials || 'U'}
                  </div>
                  <h4 className="mt-4 max-w-full truncate text-lg sm:text-2xl font-bold text-white tracking-tight">
                    {popupAccountName}
                  </h4>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-2 text-center w-full">
                  {/* Perfect 1:1 Circular Avatar View with Responsive Sizing */}
                  <div className="relative h-44 w-44 xs:h-52 xs:w-52 sm:h-64 sm:w-64 md:h-72 md:w-72 shrink-0 aspect-square rounded-full overflow-hidden border-4 border-white/20 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.8)] ring-4 ring-primary/40 select-none">
                    <img
                      src={previewImage.src}
                      alt={previewImage.alt}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <h4 className="mt-4 max-w-full truncate text-lg sm:text-2xl font-bold text-white tracking-tight">
                    {popupAccountName}
                  </h4>
                </div>
              )}

              {/* Preview Modal Action Bar with Accessible Icons */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewImage(null);
                    setShowProfilePopup(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs sm:text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:opacity-90 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-xs sm:text-sm font-semibold text-white/90 transition-all hover:bg-white/20 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};
