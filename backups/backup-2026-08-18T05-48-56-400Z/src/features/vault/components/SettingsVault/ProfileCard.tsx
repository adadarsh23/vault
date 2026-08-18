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

interface ProfileCardProps {
  username: string | null;
  profile: AuthenticatedProfile | null;
  isSavingProfile: boolean;
  onSaveProfile: (
    profileName: string,
    profilePhoto: string
  ) => Promise<{ saved: boolean; errorMessage?: string }>;
  syncHealthLabel: string;
  lastSuccessfulSyncAt: number | string | null | undefined;
  storageUsedBytes: number;
  itemCount: number;
  sessionsCount: number;
  mediaBreakdown: {
    photo: { count: number; bytes: number };
    video: { count: number; bytes: number };
    audio: { count: number; bytes: number };
    other: { count: number; bytes: number };
  };
  onNavigate: (tab: string) => void;
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
  // onNavigate,
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
    src: string;
    alt: string;
  } | null>(null);
  const [profileNameInput, setProfileNameInput] = React.useState(
    savedProfileName === 'none' ? '' : savedProfileName
  );
  const [profilePhotoInput, setProfilePhotoInput] = React.useState(
    savedProfilePhoto === 'none' ? '' : savedProfilePhoto
  );
  const [profileSaveError, setProfileSaveError] = React.useState<string | null>(null);

  const handleAvatarUploadSuccess = React.useCallback(
    (avatarUrl: string) => {
      setProfilePhotoInput(avatarUrl);
      setProfileSaveError(null);
      const activeName = (
        profileNameInput.trim() || savedProfileName !== 'none'
          ? profileNameInput.trim() || savedProfileName
          : accountName
      ).trim();
      onSaveProfile(activeName || accountName, avatarUrl);
    },
    [onSaveProfile, profileNameInput, savedProfileName, accountName]
  );

  const fastAvatar = useFastAvatar({
    userId: profile?.id || 'u_guest',
    initialAvatarUrl: hasProfilePhoto ? savedProfilePhoto : undefined,
    onUploadSuccess: handleAvatarUploadSuccess,
  });

  const popupAccountName = (profileNameInput.trim() || accountName).trim();
  const popupAvatarInitial = popupAccountName.charAt(0).toUpperCase() || 'U';
  const popupPhotoValue = profilePhotoInput.trim();

  // Memoize — avoids re-running URL parse on every render cycle
  const isPhotoInputValid = React.useMemo(
    () => isValidProfilePhotoInput(profilePhotoInput),
    [profilePhotoInput]
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

  const totalMediaBytes = React.useMemo(
    () =>
      (mediaBreakdown?.photo?.bytes || 0) +
      (mediaBreakdown?.video?.bytes || 0) +
      (mediaBreakdown?.audio?.bytes || 0) +
      (mediaBreakdown?.other?.bytes || 0),
    [mediaBreakdown]
  );

  const totalMediaCount = React.useMemo(
    () =>
      (mediaBreakdown?.photo?.count || 0) +
      (mediaBreakdown?.video?.count || 0) +
      (mediaBreakdown?.audio?.count || 0) +
      (mediaBreakdown?.other?.count || 0),
    [mediaBreakdown]
  );

  const photoPct =
    totalMediaBytes > 0
      ? Math.round(((mediaBreakdown?.photo?.bytes || 0) / totalMediaBytes) * 100)
      : 0;
  const videoPct =
    totalMediaBytes > 0
      ? Math.round(((mediaBreakdown?.video?.bytes || 0) / totalMediaBytes) * 100)
      : 0;
  const audioPct =
    totalMediaBytes > 0
      ? Math.round(((mediaBreakdown?.audio?.bytes || 0) / totalMediaBytes) * 100)
      : 0;
  const otherPct =
    totalMediaBytes > 0
      ? Math.round(((mediaBreakdown?.other?.bytes || 0) / totalMediaBytes) * 100)
      : 0;

  return (
    <SectionCard
      title="Vault Profile"
      description="A focused account snapshot with quick profile actions and expandable account details."
    >
      <div className="space-y-4">
        <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-5 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.18)] transition-colors dark:border-white/10 dark:bg-black sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="button"
              tabIndex={0}
              aria-label="Open profile editor"
              aria-haspopup="dialog"
              onClick={() => setShowProfilePopup(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setShowProfilePopup(true);
                }
              }}
              className="flex w-full min-w-0 items-start gap-3 rounded-2xl border border-transparent p-2 text-left transition-colors hover:border-card-border hover:bg-card-bg/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 sm:items-center sm:gap-4"
            >
              <SmartAvatar
                src={
                  fastAvatar.avatarUrl ||
                  (hasProfilePhoto && !isCardImageBroken ? savedProfilePhoto : null)
                }
                blurHash={fastAvatar.blurHash}
                name={accountName}
                size={80}
                isProcessing={fastAvatar.isProcessing}
                isUploading={fastAvatar.isUploading}
                isOfflineQueued={fastAvatar.isOfflineQueued}
                error={fastAvatar.error}
                onFileSelect={fastAvatar.processAndUploadAvatar}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
                  Active account
                </p>
                <h3 className="mt-2 break-words text-xl font-semibold leading-tight text-text sm:text-2xl">
                  {accountName}
                </h3>
                {username ? (
                  <p className="mt-1 break-words text-sm font-medium leading-snug text-text/70 sm:text-base">
                    @{username}
                  </p>
                ) : null}
              </div>
            </div>
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
                  title={`Photos: ${formatBytes(mediaBreakdown.photo.bytes)} (${photoPct}%)`}
                />
              )}
              {videoPct > 0 && (
                <div
                  style={{ width: `${videoPct}%` }}
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  title={`Videos: ${formatBytes(mediaBreakdown.video.bytes)} (${videoPct}%)`}
                />
              )}
              {audioPct > 0 && (
                <div
                  style={{ width: `${audioPct}%` }}
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  title={`Audio: ${formatBytes(mediaBreakdown.audio.bytes)} (${audioPct}%)`}
                />
              )}
              {otherPct > 0 && (
                <div
                  style={{ width: `${otherPct}%` }}
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  title={`All Other: ${formatBytes(mediaBreakdown.other.bytes)} (${otherPct}%)`}
                />
              )}
            </div>
          )}

          <div className="grid gap-2.5 sm:gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
            {/* Photos */}
            <div
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 overflow-hidden p-3.5 transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/[0.02] dark:bg-black/30 sm:p-4`}
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
                  {mediaBreakdown.photo.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {mediaBreakdown.photo.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(mediaBreakdown.photo.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (mediaBreakdown.photo.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Videos */}
            <div
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 overflow-hidden p-3.5 transition-all duration-300 hover:border-purple-500/30 hover:bg-purple-500/[0.02] dark:bg-black/30 sm:p-4`}
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
                  {mediaBreakdown.video.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {mediaBreakdown.video.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(mediaBreakdown.video.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-purple-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (mediaBreakdown.video.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Audio */}
            <div
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 overflow-hidden p-3.5 transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] dark:bg-black/30 sm:p-4`}
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
                  {mediaBreakdown.audio.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {mediaBreakdown.audio.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(mediaBreakdown.audio.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (mediaBreakdown.audio.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* All Other */}
            <div
              className={`${SETTINGS_PANEL_SOFT} group relative min-w-0 overflow-hidden p-3.5 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.02] dark:bg-black/30 sm:p-4`}
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
                  {mediaBreakdown.other.count}
                </p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-text/35">
                  {mediaBreakdown.other.count === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="relative z-10 mt-1 truncate text-[11px] font-medium text-text/50">
                {formatBytes(mediaBreakdown.other.bytes)}
              </p>
              <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-text/5">
                <div
                  className="h-full rounded-full bg-amber-500/70 transition-all duration-500"
                  style={{
                    width: `${totalMediaBytes > 0 ? (mediaBreakdown.other.bytes / totalMediaBytes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {showProfilePopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-[2px]">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-card-border bg-bg p-4 sm:p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] dark:bg-black">
              <h3 id="edit-profile-title" className="text-lg font-semibold text-text">
                Edit Profile
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-text/50">
                Update profile name and profile image URL.
              </p>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-card-border/70 bg-card-bg/50 p-3">
                {popupPhotoValue && !isPopupImageBroken ? (
                  <button
                    type="button"
                    aria-label="Open popup profile image preview"
                    onClick={() =>
                      setPreviewImage({
                        src: popupPhotoValue,
                        alt: `${popupAccountName} profile preview`,
                      })
                    }
                    className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30"
                  >
                    <img
                      src={popupPhotoValue}
                      alt={popupAccountName}
                      loading="lazy"
                      decoding="async"
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-full object-cover"
                      onError={() => setIsPopupImageBroken(true)}
                    />
                  </button>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
                    {popupAvatarInitial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{popupAccountName}</p>
                  <p className="truncate text-xs text-text/50">
                    {popupPhotoValue && !isPopupImageBroken
                      ? 'Profile photo preview'
                      : 'Monogram preview'}
                  </p>
                </div>
              </div>
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
                        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                        setProfileSaveError(null);
                      }
                    }}
                    placeholder="Enter display name"
                    maxLength={120}
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
                            setProfilePhotoInput('');
                            setIsPopupImageBroken(false);
                            if (profileSaveError) {
                              setProfileSaveError(null);
                            }
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-red-500 transition-colors hover:underline"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Remove Photo</span>
                        </button>
                      ) : null}
                      <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <span>Upload Photo</span>
                        <input
                          id="profile-photo-file-input"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (!file.type.startsWith('image/')) {
                              setProfileSaveError('Please select an image file.');
                              return;
                            }
                            if (file.size > 35 * 1024 * 1024) {
                              setProfileSaveError('Image file must be under 35MB.');
                              return;
                            }
                            try {
                              await fastAvatar.processAndUploadAvatar(file);
                            } catch {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const result = evt.target?.result;
                                if (typeof result === 'string') {
                                  setProfilePhotoInput(result);
                                  setProfileSaveError(null);
                                }
                              };
                              reader.onerror = () => {
                                setProfileSaveError(
                                  'Failed to read the image file. Please try again.'
                                );
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <Input
                    value={profilePhotoInput}
                    onChange={(event) => {
                      setProfilePhotoInput(event.target.value);
                      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                      if (profileSaveError) {
                        setProfileSaveError(null);
                      }
                    }}
                    placeholder="Enter HTTP/HTTPS URL or upload image (up to 35MB)"
                    maxLength={75000000}
                    aria-label="Profile Image URL or Data"
                  />
                </div>
                {!isPhotoInputValid ? (
                  <p className="text-xs text-red-500">
                    Please use a valid HTTP/HTTPS image URL or upload an image file, or leave it
                    blank.
                  </p>
                ) : null}
                {profileSaveError ? (
                  <p className="text-xs text-red-500">Failed to save profile. {profileSaveError}</p>
                ) : null}
              </div>
              <div className="mt-5 flex flex-col-reverse min-[420px]:flex-row gap-2 sm:gap-3">
                <Button
                  variant="secondary"
                  loading={isSavingProfile}
                  disabled={!isPhotoInputValid}
                  className="w-full min-[420px]:w-auto justify-center"
                  onClick={async () => {
                    const result = await onSaveProfile(
                      profileNameInput.trim() || 'none',
                      profilePhotoInput.trim() || 'none'
                    );
                    if (result.saved) {
                      setProfileSaveError(null);
                      setShowProfilePopup(false);
                      return;
                    }

                    setProfileSaveError(result.errorMessage || 'Failed to save.');
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
                  disabled={isSavingProfile}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {previewImage && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                aria-label="Close image preview"
                onClick={() => setPreviewImage(null)}
                className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={previewImage.src}
                alt={previewImage.alt}
                loading="lazy"
                decoding="async"
                className="max-h-[85vh] w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};
