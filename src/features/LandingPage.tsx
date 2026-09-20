import { lazy, Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { Lock, ChevronRight, Trash2, X, UserCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const Background = lazy(() =>
  import('../components/layout/Background').then((module) => ({
    default: module.Background || (module as any).default,
  })),
);

const Footer = lazy(() =>
  import('../components/layout/Footer').then((module) => ({
    default: module.Footer || (module as any).default,
  })),
);

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

interface LandingPageProps {
  onEnterVault: () => void;
  /** Optional — when provided, renders the Save Profile button and popup */
  onSaveProfile?: (
    profileName: string,
    profilePhoto: string,
  ) => Promise<{ saved: boolean; errorMessage?: string }>;
  /** Optional — mirrors the isSavingProfile loading state from parent */
  isSavingProfile?: boolean;
}

export function LandingPage({
  onEnterVault,
  onSaveProfile,
  isSavingProfile = false,
}: LandingPageProps) {
  const [showDecorativeEffects, setShowDecorativeEffects] = useState(false);

  // Profile popup state — only used when onSaveProfile is provided
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profilePhotoInput, setProfilePhotoInput] = useState('');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isPopupImageBroken, setIsPopupImageBroken] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

  const popupAccountName = profileNameInput.trim() || 'Profile';
  const popupAvatarInitial = popupAccountName.charAt(0).toUpperCase() || 'P';
  const popupPhotoValue = profilePhotoInput.trim();

  // Memoize — avoids re-running URL parse on every render cycle
  const isPhotoInputValid = useMemo(
    () => isValidProfilePhotoInput(profilePhotoInput),
    [profilePhotoInput],
  );

  // Reset broken-image flag whenever user changes the photo input
  useEffect(() => {
    setIsPopupImageBroken(false);
  }, [profilePhotoInput]);

  const handleSaveProfile = useCallback(async () => {
    if (!onSaveProfile) return;
    const result = await onSaveProfile(
      profileNameInput.trim() || 'none',
      profilePhotoInput.trim() || 'none',
    );
    if (result.saved) {
      setProfileSaveError(null);
      setShowProfilePopup(false);
      return;
    }
    setProfileSaveError(result.errorMessage || 'Failed to save.');
  }, [onSaveProfile, profileNameInput, profilePhotoInput]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(
        () => {
          setShowDecorativeEffects(true);
        },
        { timeout: 1200 },
      );
      return () => {
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(() => {
      setShowDecorativeEffects(true);
    }, 700);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-svh w-full max-w-full bg-bg text-text overflow-x-clip selection:bg-text selection:text-bg isolate">
      {showDecorativeEffects ? (
        <Suspense fallback={null}>
          <Background />
        </Suspense>
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]"
        />
      )}

      <nav className="relative z-10 w-full border-b border-card-border/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-text text-bg shrink-0 ">
              <Lock className="w-7 h-7 sm:w-6 sm:h-6" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight">Vault</span>
          </div>

          <Button
            className="rounded-full px-5 sm:px-6 h-10 sm:h-11 text-sm sm:text-base shadow-lg shadow-text/10"
            onClick={onEnterVault}
            data-testid="enter-vault-button"
          >
            Vault
          </Button>
        </div>
      </nav>

      <main className="relative z-10 flex min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-5rem)] items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/[0.03] px-4 py-2 text-[10px] sm:text-xs font-semibold backdrop-blur tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Military-grade Encryption
            </div>

            <h1 className="text-[clamp(1.8rem,9vw,9rem)] font-black tracking-tighter leading-[0.95] sm:leading-[1.05] break-words max-w-full">
              <span className="block sm:whitespace-nowrap">Your digital life,</span>
              <span
                className="block bg-gradient-to-r from-text/60 via-text to-text/40 bg-clip-text text-transparent italic bg-[length:200%_auto] transform-gpu py-1 sm:py-2"
                style={{ backgroundSize: '200% auto' }}
              >
                truly private.
              </span>
            </h1>

            <p className="mt-8 max-w-2xl text-base sm:text-lg md:text-xl text-text/50 leading-relaxed font-medium px-4 sm:px-0">
              A secure and private vault for your photos, notes, and sensitive data. Everything is
              encrypted locally. Your keys never leave your device.
            </p>

            <div className="mt-12 flex w-full flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="w-full sm:w-auto rounded-full px-10 h-14 text-lg shadow-2xl shadow-text/10 hover:shadow-text/20 transition-all hover:-translate-y-1 active:scale-95"
                onClick={onEnterVault}
                data-testid="get-started-button"
              >
                Get Started
                <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>

              {onSaveProfile ? (
                <Button
                  variant="secondary"
                  size="lg"
                  loading={isSavingProfile}
                  disabled={!isPhotoInputValid}
                  className="w-full sm:w-auto rounded-full px-10 h-14 text-lg transition-all hover:-translate-y-1 active:scale-95"
                  onClick={() => {
                    setProfileSaveError(null);
                    setShowProfilePopup(true);
                  }}
                  data-testid="save-profile-button"
                >
                  <UserCircle2 className="mr-2 w-5 h-5" />
                  Save Profile
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {showDecorativeEffects ? (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      ) : null}

      {/* Save Profile Popup — only mounted when onSaveProfile is wired */}
      {onSaveProfile && showProfilePopup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-card-border bg-bg p-4 sm:p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] dark:bg-black">
            <h3 className="text-lg font-semibold text-text">Edit Profile</h3>
            <p className="mt-1 text-xs sm:text-sm text-text/50">
              Update profile name and profile image URL.
            </p>

            {/* Live preview strip */}
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

            {/* Form fields */}
            <div className="mt-4 grid gap-3">
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
                        id="landing-profile-photo-file-input"
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
                            const arrayBuffer = await file.arrayBuffer();
                            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                            const contentHash = Array.from(new Uint8Array(hashBuffer))
                              .map((b) => b.toString(16).padStart(2, '0'))
                              .join('')
                              .substring(0, 16);
                            const userId = 'u_profile';
                            const presignRes = await fetch('/api/avatar/presign', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId, contentHash, mimeType: file.type }),
                            });
                            if (presignRes.ok) {
                              const { uploadUrl, publicUrl } = await presignRes.json();
                              let safeUploadUrl = uploadUrl;
                              let safePublicUrl = publicUrl;
                              if (
                                typeof window !== 'undefined' &&
                                window.location.protocol === 'https:'
                              ) {
                                if (safeUploadUrl?.startsWith('http:')) {
                                  try {
                                    const parsed = new URL(safeUploadUrl, window.location.href);
                                    safeUploadUrl =
                                      parsed.hostname === window.location.hostname
                                        ? parsed.pathname + parsed.search
                                        : safeUploadUrl.replace(/^http:/, 'https:');
                                  } catch {
                                    safeUploadUrl = safeUploadUrl.replace(/^http:/, 'https:');
                                  }
                                }
                                if (safePublicUrl?.startsWith('http:')) {
                                  try {
                                    const parsed = new URL(safePublicUrl, window.location.href);
                                    safePublicUrl =
                                      parsed.hostname === window.location.hostname
                                        ? parsed.pathname + parsed.search
                                        : safePublicUrl.replace(/^http:/, 'https:');
                                  } catch {
                                    safePublicUrl = safePublicUrl.replace(/^http:/, 'https:');
                                  }
                                }
                              }
                              const uploadRes = await fetch(safeUploadUrl, {
                                method: 'PUT',
                                headers: { 'Content-Type': file.type },
                                body: file,
                              });
                              if (uploadRes.ok) {
                                setProfilePhotoInput(safePublicUrl);
                                setProfileSaveError(null);
                                return;
                              }
                            }
                          } catch {
                            // Fallback to FileReader inline Data URL
                          }

                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const result = evt.target?.result;
                            if (typeof result === 'string') {
                              setProfilePhotoInput(result);
                              setProfileSaveError(null);
                            }
                          };
                          reader.onerror = () => {
                            setProfileSaveError('Failed to read the image file. Please try again.');
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
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

            {/* Actions */}
            <div className="mt-5 flex flex-col-reverse min-[420px]:flex-row gap-2 sm:gap-3">
              <Button
                variant="secondary"
                loading={isSavingProfile}
                disabled={!isPhotoInputValid}
                className="w-full min-[420px]:w-auto justify-center"
                onClick={handleSaveProfile}
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
      ) : null}

      {/* Image preview lightbox */}
      {previewImage ? (
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
      ) : null}
    </div>
  );
}

export default LandingPage;
