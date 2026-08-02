import React from 'react';
import {
  Image,
  Video,
  Music,
  FileText,
  Fingerprint,
  CreditCard,
  ShieldCheck,
  Wifi,
  MessageSquare,
  MapPin,
  HardDrive,
  CheckCircle2,
  ShieldAlert,
  ListTodo,
} from 'lucide-react';
import { SectionCard, ToggleCard } from './SharedComponents';
import { DurationSelector } from './DurationSelector';
import { FILE_TYPE_SUPPORT, MAX_UPLOAD_SIZE_MB } from '../../../../lib/fileHandling';
import {
  MIN_GENERATED_CREDENTIAL_LENGTH,
  MAX_GENERATED_CREDENTIAL_LENGTH,
} from '../../../../lib/utils';

const AUTO_LOCK_OPTIONS = [1, 5, 10, 15, 30, 60];
const CLIPBOARD_CLEAR_OPTIONS = [10, 15, 30, 45, 60];
const formatMinutes = (v: number) => `${v}m`;
const formatSeconds = (v: number) => `${v}s`;

const PHOTO_TYPES_TEXT = FILE_TYPE_SUPPORT.photo.join(', ');
const VIDEO_TYPES_TEXT = FILE_TYPE_SUPPORT.video.join(', ');
const AUDIO_TYPES_TEXT = FILE_TYPE_SUPPORT.audio.join(', ');
const DOCUMENT_TYPES_TEXT = FILE_TYPE_SUPPORT.document.join(', ');

interface PrivacyInterfaceCardProps {
  preferences: any;
  updatePreferences: (prefs: any) => void;
  allowRestrictedTypes: boolean;
  setAllowRestrictedTypes: (value: boolean) => void;
  generatedLengthInput: string;
  setGeneratedLengthInput: (value: string) => void;
}

export const PrivacyInterfaceCard = React.memo<PrivacyInterfaceCardProps>(({
  preferences,
  updatePreferences,
  allowRestrictedTypes,
  setAllowRestrictedTypes,
  generatedLengthInput,
  setGeneratedLengthInput,
}) => (
  <SectionCard
    title="Privacy and Interface"
    description="Customize the vault behavior and interface to match your workflow."
  >
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-3">
        <ToggleCard
          title="Sidebar on the right"
          description="Move the navigation sidebar to the right side of the screen."
          checked={preferences.sidebarPosition === 'right'}
          onChange={(value) =>
            updatePreferences({
              sidebarPosition: value ? 'right' : 'left',
            })
          }
        />
        <div className="space-y-1">
          <ToggleCard
            title="Auto-lock on inactivity"
            description="Lock the vault after a period of inactivity."
            checked={preferences.isAutoLockEnabled}
            onChange={(value) => updatePreferences({ isAutoLockEnabled: value })}
          />
          {preferences.isAutoLockEnabled && (
            <div className="rounded-xl border border-card-border bg-card-bg p-3 shadow-sm transition-colors dark:border-white/10 dark:bg-black">
              <DurationSelector
                options={AUTO_LOCK_OPTIONS}
                current={preferences.autoLockDuration}
                onChange={(value) => updatePreferences({ autoLockDuration: value })}
                formatLabel={formatMinutes}
              />
            </div>
          )}
        </div>
        <ToggleCard
          title="Blur on tab hide"
          description="Hide the vault content when the browser tab is not active."
          checked={preferences.isBlurOnTabHideEnabled}
          onChange={(value) => updatePreferences({ isBlurOnTabHideEnabled: value })}
        />
        <ToggleCard
          title="Lock vault on tab hide"
          description="Immediately lock the vault when switching browser tabs or minimizing."
          checked={preferences.isLockOnTabHideEnabled || false}
          onChange={(value) => updatePreferences({ isLockOnTabHideEnabled: value })}
        />
        <div className="space-y-1">
          <ToggleCard
            title="Clipboard auto-clear"
            description="Remove copied secrets from the clipboard automatically."
            checked={preferences.isClipboardAutoClearEnabled}
            onChange={(value) => updatePreferences({ isClipboardAutoClearEnabled: value })}
          />
          {preferences.isClipboardAutoClearEnabled && (
            <div className="rounded-xl border border-card-border bg-card-bg p-3 shadow-sm transition-colors dark:border-white/10 dark:bg-black">
              <DurationSelector
                options={CLIPBOARD_CLEAR_OPTIONS}
                current={preferences.clipboardAutoClearDuration || 30}
                onChange={(value) => updatePreferences({ clipboardAutoClearDuration: value })}
                formatLabel={formatSeconds}
              />
            </div>
          )}
        </div>
        <ToggleCard
          title="Mask passwords and secrets"
          description="Obscure sensitive values by default."
          checked={preferences.isMaskPasswordsEnabled}
          onChange={(value) => updatePreferences({ isMaskPasswordsEnabled: value })}
        />
        <ToggleCard
          title="Conceal secret length"
          description="Mask passwords with a constant fixed-length string (••••••••••••) to prevent length inference."
          checked={preferences.isFixedMaskLengthEnabled || false}
          onChange={(value) => updatePreferences({ isFixedMaskLengthEnabled: value })}
        />
        <ToggleCard
          title="Auto-purge trash on lock"
          description="Permanently delete soft-deleted items from trash when locking the vault."
          checked={preferences.isPurgeTrashOnLockEnabled || false}
          onChange={(value) => updatePreferences({ isPurgeTrashOnLockEnabled: value })}
        />
        <ToggleCard
          title="Require delete confirmation"
          description="Prompt for user confirmation before moving items to trash or deleting."
          checked={preferences.isRequireConfirmationOnDelete !== false}
          onChange={(value) => updatePreferences({ isRequireConfirmationOnDelete: value })}
        />
        <ToggleCard
          title="Ephemeral search mode"
          description="Automatically clear active search queries when switching between vault views."
          checked={preferences.isEphemeralSearchEnabled || false}
          onChange={(value) => updatePreferences({ isEphemeralSearchEnabled: value })}
        />
        <ToggleCard
          title="Strip photo metadata"
          description="Remove GPS coordinates and camera information from photos automatically."
          checked={preferences.isPhotoExifStripped}
          onChange={(value) => updatePreferences({ isPhotoExifStripped: value })}
        />
      </div>

      <div className="space-y-3">
        <ToggleCard
          title="Inline media previews"
          description="Show lightweight previews inside media and audio cards."
          checked={preferences.isInlineMediaPreviewEnabled}
          onChange={(value) => updatePreferences({ isInlineMediaPreviewEnabled: value })}
        />
        <ToggleCard
          title="Lightweight preview mode"
          description="Use low-cost media placeholders in grids and only decode heavy previews after opening an item."
          checked={preferences.isLightweightPreviewModeEnabled}
          onChange={(value) => updatePreferences({ isLightweightPreviewModeEnabled: value })}
        />
        <ToggleCard
          title="Autoplay media previews"
          description="Play secure video previews automatically after decryption."
          checked={preferences.isMediaAutoplayEnabled}
          onChange={(value) => updatePreferences({ isMediaAutoplayEnabled: value })}
        />
        <ToggleCard
          title="Low data mode (video)"
          description="Cap video preview quality for slow or metered networks."
          checked={preferences.isLowDataModeEnabled}
          onChange={(value) => updatePreferences({ isLowDataModeEnabled: value })}
        />
        <ToggleCard
          title="Network-aware autoplay"
          description="Disable autoplay on weak network or low battery conditions."
          checked={preferences.isNetworkAwareAutoplayEnabled}
          onChange={(value) => updatePreferences({ isNetworkAwareAutoplayEnabled: value })}
        />
        <ToggleCard
          title="Performance HUD"
          description="Show stream diagnostics overlay in video preview."
          checked={preferences.isPerformanceHudEnabled}
          onChange={(value) => updatePreferences({ isPerformanceHudEnabled: value })}
        />
        <ToggleCard
          title="Allow restricted file types"
          description="Permit installer, script, and executable uploads in file-focused vault areas."
          checked={allowRestrictedTypes}
          onChange={setAllowRestrictedTypes}
        />
        <ToggleCard
          title="Stealth mode"
          description="Disable activity logging for this vault."
          checked={!preferences.isActivityLoggingEnabled}
          onChange={(value) => updatePreferences({ isActivityLoggingEnabled: !value })}
        />
        <ToggleCard
          title="Live capture technical info"
          description="Show security badges and real-time recording size during media capture."
          checked={preferences.isLiveCaptureInfoEnabled}
          onChange={(value) => updatePreferences({ isLiveCaptureInfoEnabled: value })}
        />
        <ToggleCard
          title="Confirm page refresh"
          description="Prompt for confirmation before refreshing or closing the page when the vault is ready."
          checked={preferences.isRefreshConfirmationEnabled}
          onChange={(value) => updatePreferences({ isRefreshConfirmationEnabled: value })}
        />
        <ToggleCard
          title="Aggressive video buffering"
          description="Pre-load larger chunks of encrypted video for smoother playback."
          checked={preferences.isVideoBufferingEnabled}
          onChange={(value) => updatePreferences({ isVideoBufferingEnabled: value })}
        />
        <ToggleCard
          title="Show audio waveform"
          description="Generate and display visual waveforms for encrypted audio files."
          checked={preferences.isAudioWaveformEnabled}
          onChange={(value) => updatePreferences({ isAudioWaveformEnabled: value })}
        />
      </div>
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-card-border bg-card-bg p-4 flex flex-col justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
            Max recording size (MB)
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="number"
              placeholder="Enter size"
              inputMode="numeric"
              pattern="[0-9]*"
              min="1"
              max="2048"
              value={preferences.maxRecordingSizeMB || 500}
              onChange={(event) => {
                const val = Number(event.target.value);
                if (!isNaN(val) && val > 0) {
                  updatePreferences({
                    maxRecordingSizeMB: Math.min(val, 2048),
                  });
                }
              }}
              className="h-11 w-full rounded-xl border border-card-border bg-bg px-4 text-sm text-text outline-none transition-colors focus:border-text/30 sm:max-w-[8rem]"
            />
            <p className="text-xs leading-5 text-text/45 text-balance">
              Auto-stop long recordings to prevent browser crashes. Default is 500MB (limit: 2GB).
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-card-border bg-card-bg p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
          Generated credential length
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="number"
            placeholder="Enter length"
            inputMode="numeric"
            pattern="[0-9]*"
            min={MIN_GENERATED_CREDENTIAL_LENGTH}
            max={MAX_GENERATED_CREDENTIAL_LENGTH}
            value={generatedLengthInput}
            onChange={(event) => {
              let val = event.target.value;
              if (val === '') {
                setGeneratedLengthInput('');
                return;
              }
              val = val.replace(/^0+/, '');
              let num = Number(val);
              if (Number.isNaN(num)) return;
              if (num > MAX_GENERATED_CREDENTIAL_LENGTH) {
                num = MAX_GENERATED_CREDENTIAL_LENGTH;
              }
              setGeneratedLengthInput(String(num));
            }}
            onBlur={() => {
              let num = Number(generatedLengthInput);
              if (Number.isNaN(num)) {
                num = MIN_GENERATED_CREDENTIAL_LENGTH;
              }
              if (num < MIN_GENERATED_CREDENTIAL_LENGTH) {
                num = MIN_GENERATED_CREDENTIAL_LENGTH;
              }
              if (num > MAX_GENERATED_CREDENTIAL_LENGTH) {
                num = MAX_GENERATED_CREDENTIAL_LENGTH;
              }
              setGeneratedLengthInput(String(num));
              updatePreferences({ generatedCredentialLength: num });
            }}
            onKeyDown={(event) => {
              if (['e', 'E', '+', '-', '.'].includes(event.key)) {
                event.preventDefault();
              }
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            className="h-11 w-full rounded-xl border border-card-border bg-bg px-4 text-sm text-text outline-none transition-colors focus:border-text/30 sm:max-w-[8rem]"
          />
          <p className="text-xs leading-5 text-text/45">
            Used for generated account passwords and master keys. Range:{' '}
            {MIN_GENERATED_CREDENTIAL_LENGTH}-{MAX_GENERATED_CREDENTIAL_LENGTH} characters.
          </p>
        </div>
      </div>
    </div>

    <div className="mt-4 rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm transition-colors dark:border-white/10 dark:bg-black">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-card-border/60 pb-4 dark:border-white/10">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
            Supported Data Ecosystem &amp; Upload Policy
          </p>
          <p className="mt-1 text-xs text-text/60">
            Real-time security treatment, file extension coverage, and payload parameters for your vault.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-card-border bg-bg px-2.5 py-1 text-[11px] font-medium text-text/70">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            AES-256-GCM
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-card-border bg-bg px-2.5 py-1 text-[11px] font-medium text-text/70">
            <HardDrive className="h-3.5 w-3.5 text-text/40" />
            {MAX_UPLOAD_SIZE_MB} MB Limit
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-3">
        {/* Photos */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Image className="h-4 w-4 text-text/60" />
              <span>Photos &amp; Images</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              {preferences.isPhotoExifStripped ? 'EXIF Stripped' : 'EXIF Kept'}
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">{PHOTO_TYPES_TEXT}</p>
        </div>

        {/* Videos */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Video className="h-4 w-4 text-text/60" />
              <span>Videos</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              Stream Decrypted
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">{VIDEO_TYPES_TEXT}</p>
        </div>

        {/* Audio */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Music className="h-4 w-4 text-text/60" />
              <span>Audio Records</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              {preferences.isAudioWaveformEnabled ? 'Waveforms On' : 'Encrypted Audio'}
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">{AUDIO_TYPES_TEXT}</p>
        </div>

        {/* Documents */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <FileText className="h-4 w-4 text-text/60" />
              <span>Documents</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              Zero-Knowledge
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">{DOCUMENT_TYPES_TEXT}</p>
        </div>

        {/* Identities */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Fingerprint className="h-4 w-4 text-text/60" />
              <span>Identities &amp; Passports</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              Field Obscured
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">SSN, Passport, Driver License, Tax IDs</p>
        </div>

        {/* Financial Cards */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <CreditCard className="h-4 w-4 text-text/60" />
              <span>Cards &amp; Bank Accounts</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              PAN/CVV Protected
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">Credit/Debit Cards, IBAN, SWIFT, PINs</p>
        </div>

        {/* Credentials & Secrets */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <ShieldCheck className="h-4 w-4 text-text/60" />
              <span>Credentials &amp; Secrets</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              {preferences.isFixedMaskLengthEnabled
                ? 'Fixed Mask'
                : preferences.isMaskPasswordsEnabled
                ? 'Masked Display'
                : 'Plaintext Reveal'}
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">Passwords, API Keys, SSH Keys, Phrases</p>
        </div>

        {/* Wi-Fi Credentials */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Wifi className="h-4 w-4 text-text/60" />
              <span>Wi-Fi Credentials</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              WPA2/3 &amp; QR
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">Network SSIDs, Passwords, Security Protocols</p>
        </div>

        {/* Notes & Checklists */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <ListTodo className="h-4 w-4 text-text/60" />
              <span>Notes &amp; Checklists</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              Rich Markdown
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">Markdown Notes, Tasks, To-dos, Schedules</p>
        </div>

        {/* Chat Logs */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <MessageSquare className="h-4 w-4 text-text/60" />
              <span>Encrypted Chat Logs</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              E2E Encrypted
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">Message Transcripts &amp; Media Attachments</p>
        </div>

        {/* Locations */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <MapPin className="h-4 w-4 text-text/60" />
              <span>Geographic Locations</span>
            </div>
            <span className="rounded-md bg-text/5 px-2 py-0.5 text-[10px] font-medium text-text/60">
              Client Obfuscated
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">GPS Coordinates, Addresses, Pinned Places</p>
        </div>

        {/* Restricted Executables Policy */}
        <div className="rounded-xl border border-card-border bg-bg p-3.5 transition-colors dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <ShieldAlert className="h-4 w-4 text-text/60" />
              <span>Executables &amp; Binaries</span>
            </div>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                allowRestrictedTypes
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {allowRestrictedTypes ? 'Permitted' : 'Blocked'}
            </span>
          </div>
          <p className="mt-2 text-xs text-text/45">.exe, .sh, .bat, .apk, .iso (Controlled by Policy)</p>
        </div>
      </div>
    </div>
  </SectionCard>
));
PrivacyInterfaceCard.displayName = 'PrivacyInterfaceCard';
