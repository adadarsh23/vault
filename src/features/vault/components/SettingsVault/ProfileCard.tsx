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
  // ChevronDown,
  // ChevronUp,
  // Network,
  // ClipboardList,
  // MonitorSmartphone,
  // Lock,
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
      return (
        parsed.protocol === 'https:' ||
        parsed.protocol === 'http:' ||
        parsed.protocol === 'data:' ||
        parsed.protocol === 'blob:'
      );
    } catch {
      return false;
    }
  };

  const savedProfileName = (profile?.profileName || 'none').trim();
  const savedProfilePhoto = (profile?.profilePhoto || 'none').trim();
  const accountName = (
    (savedProfileName !== 'none' ? savedProfileName : '') ||
    username ||
    profile?.username ||
    'Unknown'
  ).trim();
  const avatarInitial = accountName.charAt(0).toUpperCase() || 'U';
  const hasProfilePhoto = savedProfilePhoto !== 'none' && savedProfilePhoto.length > 0;
  // const [showDetails, setShowDetails] = React.useState(false)
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
  const popupAccountName = (profileNameInput.trim() || accountName).trim();
  const popupAvatarInitial = popupAccountName.charAt(0).toUpperCase() || 'U';
  const popupPhotoValue = profilePhotoInput.trim();
  const isPhotoInputValid = isValidProfilePhotoInput(profilePhotoInput);

  const [isCardImageBroken, setIsCardImageBroken] = React.useState(false);
  const [isPopupImageBroken, setIsPopupImageBroken] = React.useState(false);

  React.useEffect(() => {
    setProfileNameInput(savedProfileName === 'none' ? '' : savedProfileName);
    setProfilePhotoInput(savedProfilePhoto === 'none' ? '' : savedProfilePhoto);
    setIsCardImageBroken(false);
    setIsPopupImageBroken(false);
  }, [savedProfileName, savedProfilePhoto]);

  React.useEffect(() => {
    setIsPopupImageBroken(false);
  }, [profilePhotoInput]);

  React.useEffect(() => {
    if (location.hash === '#edit-profile') {
      setShowProfilePopup(true);
      setProfileSaveError(null);
    }
  }, [location.hash]);

  React.useEffect(() => {
    if (location.hash === '#edit-profile' && openProfileEditorRequestToken) {
      setShowProfilePopup(true);
      setProfileSaveError(null);
    }
  }, [location.hash, openProfileEditorRequestToken]);

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
              onClick={() => setShowProfilePopup(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setShowProfilePopup(true);
                }
              }}
              className="flex w-full min-w-0 items-start gap-3 rounded-2xl border border-transparent p-2 text-left transition-colors hover:border-card-border hover:bg-card-bg/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 sm:items-center sm:gap-4"
            >
              {hasProfilePhoto && !isCardImageBroken ? (
                <button
                  type="button"
                  aria-label="Open profile image preview"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewImage({
                      src: savedProfilePhoto,
                      alt: `${accountName} profile preview`,
                    });
                  }}
                  className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30"
                >
                  <img
                    src={savedProfilePhoto}
                    alt={accountName || 'User profile photo'}
                    loading="lazy"
                    decoding="async"
                    width={80}
                    height={80}
                    className="h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20"
                    onError={() => setIsCardImageBroken(true)}
                  />
                </button>
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary sm:h-20 sm:w-20 sm:text-3xl">
                  {avatarInitial}
                </div>
              )}
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

        <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
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

        <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-3">
          <div className={`${SETTINGS_PANEL} min-w-0 dark:bg-black/40`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
              Username
            </p>
            <p className="mt-2 truncate text-base font-semibold text-text">
              {username ? `@${username}` : 'Unknown'}
            </p>
            <p className="mt-1 text-xs text-text/45">
              {profile?.username ? `@${profile.username}` : 'Secure vault account'}
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
              Profile Created
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatDate(profile?.profileDetails?.createdAt || profile?.createdAt)}
            </p>
            <p className="mt-1 text-xs text-text/45">Initial profile save timestamp</p>
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
              Profile Updated
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              {formatDate(profile?.profileDetails?.updatedAt || profile?.updatedAt)}
            </p>
            <p className="mt-1 text-xs text-text/45">Latest profile change timestamp</p>
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
        </div>

        <div className="mt-6 space-y-3">
          <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
            <Image className="h-3.5 w-3.5" />
            Media & File Breakdown
          </h3>
          <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4">
            <div className={`${SETTINGS_PANEL_SOFT} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <Image className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-xs font-semibold text-text/60">Photos</p>
              </div>
              <p className="text-xl font-bold text-text">{mediaBreakdown.photo.count}</p>
              <p className="text-[10px] text-text/40 mt-2 font-medium">
                {formatBytes(mediaBreakdown.photo.bytes)}
              </p>
            </div>

            <div className={`${SETTINGS_PANEL_SOFT} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                  <Video className="h-4 w-4 text-purple-400" />
                </div>
                <p className="text-xs font-semibold text-text/60">Videos</p>
              </div>
              <p className="text-xl font-bold text-text">{mediaBreakdown.video.count}</p>
              <p className="text-[10px] text-text/40 mt-2 font-medium">
                {formatBytes(mediaBreakdown.video.bytes)}
              </p>
            </div>

            <div className={`${SETTINGS_PANEL_SOFT} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                  <Music className="h-4 w-4 text-green-400" />
                </div>
                <p className="text-xs font-semibold text-text/60">Audio</p>
              </div>
              <p className="text-xl font-bold text-text">{mediaBreakdown.audio.count}</p>
              <p className="text-[10px] text-text/40 mt-2 font-medium">
                {formatBytes(mediaBreakdown.audio.bytes)}
              </p>
            </div>

            <div className={`${SETTINGS_PANEL_SOFT} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <WalletCards className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-xs font-semibold text-text/60">All Other</p>
              </div>
              <p className="text-xl font-bold text-text">{mediaBreakdown.other.count}</p>
              <p className="text-[10px] text-text/40 mt-2 font-medium">
                {formatBytes(mediaBreakdown.other.bytes)}
              </p>
            </div>
          </div>
        </div>

        {showProfilePopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-xl rounded-2xl border border-card-border bg-bg p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] dark:bg-black">
              <h3 className="text-lg font-semibold text-text">Edit Profile</h3>
              <p className="mt-1 text-sm text-text/50">
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
                        setProfileSaveError(null);
                      }
                    }}
                    placeholder="Enter display name"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/45">
                      Profile Image URL / Data
                    </p>
                    <label className="cursor-pointer text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!file.type.startsWith('image/')) {
                            setProfileSaveError('Please select an image file.');
                            return;
                          }
                          if (file.size > 3 * 1024 * 1024) {
                            setProfileSaveError('Image file must be under 3MB.');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const result = evt.target?.result;
                            if (typeof result === 'string') {
                              setProfilePhotoInput(result);
                              setProfileSaveError(null);
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  </div>
                  <Input
                    value={profilePhotoInput}
                    onChange={(event) => {
                      setProfilePhotoInput(event.target.value);
                      if (profileSaveError) {
                        setProfileSaveError(null);
                      }
                    }}
                    placeholder="Enter HTTP/HTTPS URL or upload image"
                    maxLength={20480}
                  />
                </div>
                {!isPhotoInputValid ? (
                  <p className="text-xs text-red-500">
                    Please use a valid image URL (HTTP/HTTPS/data URI), or leave it blank.
                  </p>
                ) : null}
                {profileSaveError ? (
                  <p className="text-xs text-red-500">
                    Failed to save profile image link. {profileSaveError}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  loading={isSavingProfile}
                  disabled={!isPhotoInputValid}
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
