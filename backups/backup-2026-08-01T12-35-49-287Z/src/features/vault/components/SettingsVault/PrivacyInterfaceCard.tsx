import React from 'react'
import { SectionCard, ToggleCard } from './SharedComponents'
import { DurationSelector } from './DurationSelector'
import { FILE_TYPE_SUPPORT, MAX_UPLOAD_SIZE_MB } from '../../../../lib/fileHandling'
import { MIN_GENERATED_CREDENTIAL_LENGTH, MAX_GENERATED_CREDENTIAL_LENGTH } from '../../../../lib/utils'

interface PrivacyInterfaceCardProps {
  preferences: any
  updatePreferences: (prefs: any) => void
  allowRestrictedTypes: boolean
  setAllowRestrictedTypes: (value: boolean) => void
  generatedLengthInput: string
  setGeneratedLengthInput: (value: string) => void
}

export const PrivacyInterfaceCard: React.FC<PrivacyInterfaceCardProps> = ({
  preferences,
  updatePreferences,
  allowRestrictedTypes,
  setAllowRestrictedTypes,
  generatedLengthInput,
  setGeneratedLengthInput,
}) => (
  <SectionCard
    title="Privacy and Interface"
    description="Customize the vault behavior and interface to match your workflow. Controls here are arranged for mobile screens first, with a strict black-and-white look."
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
            onChange={(value) =>
              updatePreferences({ isAutoLockEnabled: value })
            }
          />
          {preferences.isAutoLockEnabled && (
            <div className="rounded-xl border border-card-border bg-card-bg p-3 shadow-sm transition-colors dark:border-white/10 dark:bg-black">
              <DurationSelector
                options={[1, 5, 10, 15, 30, 60]}
                current={preferences.autoLockDuration}
                onChange={(value) => updatePreferences({ autoLockDuration: value })}
                formatLabel={(v) => `${v}m`}
              />
            </div>
          )}
        </div>
        <ToggleCard
          title="Blur on tab hide"
          description="Hide the vault content when the browser tab is not active."
          checked={preferences.isBlurOnTabHideEnabled}
          onChange={(value) =>
            updatePreferences({ isBlurOnTabHideEnabled: value })
          }
        />
        <ToggleCard
          title="Clipboard auto-clear"
          description="Remove copied secrets from the clipboard automatically."
          checked={preferences.isClipboardAutoClearEnabled}
          onChange={(value) =>
            updatePreferences({ isClipboardAutoClearEnabled: value })
          }
        />
        <ToggleCard
          title="Mask passwords and secrets"
          description="Obscure sensitive values by default."
          checked={preferences.isMaskPasswordsEnabled}
          onChange={(value) =>
            updatePreferences({ isMaskPasswordsEnabled: value })
          }
        />
        <ToggleCard
          title="Strip photo metadata"
          description="Remove GPS coordinates and camera information from photos automatically."
          checked={preferences.isPhotoExifStripped}
          onChange={(value) =>
            updatePreferences({ isPhotoExifStripped: value })
          }
        />
      </div>

      <div className="space-y-3">
        <ToggleCard
          title="Inline media previews"
          description="Show lightweight previews inside media and audio cards."
          checked={preferences.isInlineMediaPreviewEnabled}
          onChange={(value) =>
            updatePreferences({ isInlineMediaPreviewEnabled: value })
          }
        />
        <ToggleCard
          title="Lightweight preview mode"
          description="Use low-cost media placeholders in grids and only decode heavy previews after opening an item."
          checked={preferences.isLightweightPreviewModeEnabled}
          onChange={(value) =>
            updatePreferences({ isLightweightPreviewModeEnabled: value })
          }
        />
        <ToggleCard
          title="Autoplay media previews"
          description="Play secure video previews automatically after decryption."
          checked={preferences.isMediaAutoplayEnabled}
          onChange={(value) =>
            updatePreferences({ isMediaAutoplayEnabled: value })
          }
        />
        <ToggleCard
          title="Low data mode (video)"
          description="Cap video preview quality for slow or metered networks."
          checked={preferences.isLowDataModeEnabled}
          onChange={(value) =>
            updatePreferences({ isLowDataModeEnabled: value })
          }
        />
        <ToggleCard
          title="Network-aware autoplay"
          description="Disable autoplay on weak network or low battery conditions."
          checked={preferences.isNetworkAwareAutoplayEnabled}
          onChange={(value) =>
            updatePreferences({ isNetworkAwareAutoplayEnabled: value })
          }
        />
        <ToggleCard
          title="Performance HUD"
          description="Show stream diagnostics overlay in video preview."
          checked={preferences.isPerformanceHudEnabled}
          onChange={(value) =>
            updatePreferences({ isPerformanceHudEnabled: value })
          }
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
          onChange={(value) =>
            updatePreferences({ isActivityLoggingEnabled: !value })
          }
        />
        <ToggleCard
          title="Live capture technical info"
          description="Show security badges and real-time recording size during media capture."
          checked={preferences.isLiveCaptureInfoEnabled}
          onChange={(value) =>
            updatePreferences({ isLiveCaptureInfoEnabled: value })
          }
        />
        <ToggleCard
          title="Confirm page refresh"
          description="Prompt for confirmation before refreshing or closing the page when the vault is ready."
          checked={preferences.isRefreshConfirmationEnabled}
          onChange={(value) =>
            updatePreferences({ isRefreshConfirmationEnabled: value })
          }
        />
        <ToggleCard
          title="Aggressive video buffering"
          description="Pre-load larger chunks of encrypted video for smoother playback."
          checked={preferences.isVideoBufferingEnabled}
          onChange={(value) =>
            updatePreferences({ isVideoBufferingEnabled: value })
          }
        />
        <ToggleCard
          title="Show audio waveform"
          description="Generate and display visual waveforms for encrypted audio files."
          checked={preferences.isAudioWaveformEnabled}
          onChange={(value) =>
            updatePreferences({ isAudioWaveformEnabled: value })
          }
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
                const val = Number(event.target.value)
                if (!isNaN(val) && val > 0) {
                  updatePreferences({
                    maxRecordingSizeMB: Math.min(val, 2048),
                  })
                }
              }}
              className="h-11 w-full rounded-xl border border-card-border bg-bg px-4 text-sm text-text outline-none transition-colors focus:border-text/30 sm:max-w-[8rem]"
            />
            <p className="text-xs leading-5 text-text/45 text-balance">
              Auto-stop long recordings to prevent browser crashes.
              Default is 500MB (limit: 2GB).
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
              let val = event.target.value
              if (val === '') {
                setGeneratedLengthInput('')
                return
              }
              val = val.replace(/^0+/, '')
              let num = Number(val)
              if (Number.isNaN(num)) return
              if (num > MAX_GENERATED_CREDENTIAL_LENGTH) {
                num = MAX_GENERATED_CREDENTIAL_LENGTH
              }
              setGeneratedLengthInput(String(num))
            }}
            onBlur={() => {
              let num = Number(generatedLengthInput)
              if (Number.isNaN(num)) {
                num = MIN_GENERATED_CREDENTIAL_LENGTH
              }
              if (num < MIN_GENERATED_CREDENTIAL_LENGTH) {
                num = MIN_GENERATED_CREDENTIAL_LENGTH
              }
              if (num > MAX_GENERATED_CREDENTIAL_LENGTH) {
                num = MAX_GENERATED_CREDENTIAL_LENGTH
              }
              setGeneratedLengthInput(String(num))
              updatePreferences({ generatedCredentialLength: num })
            }}
            onKeyDown={(event) => {
              if (['e', 'E', '+', '-', '.'].includes(event.key)) {
                event.preventDefault()
              }
              if (event.key === 'Enter') {
                event.currentTarget.blur()
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

    <div className="mt-4 rounded-2xl border border-card-border bg-card-bg p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
        Supported Data & Uploads
      </p>
      <div className="mt-3 grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Photos</p>
          <p className="mt-1 text-xs text-text/45">
            {FILE_TYPE_SUPPORT.photo.join(', ')}
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Videos</p>
          <p className="mt-1 text-xs text-text/45">
            {FILE_TYPE_SUPPORT.video.join(', ')}
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Audio</p>
          <p className="mt-1 text-xs text-text/45">
            {FILE_TYPE_SUPPORT.audio.join(', ')}
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Documents</p>
          <p className="mt-1 text-xs text-text/45">
            {FILE_TYPE_SUPPORT.document.join(', ')}
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Notes</p>
          <p className="mt-1 text-xs text-text/45">
            Rich Markdown text with live preview
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Credentials & Secrets</p>
          <p className="mt-1 text-xs text-text/45">
            Passwords, API keys, SSH keys, phrases
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Other Files</p>
          <p className="mt-1 text-xs text-text/45">
            Any format (executables blocked by default)
          </p>
        </div>
        <div className="rounded-2xl border border-card-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Upload limit</p>
          <p className="mt-1 text-xs text-text/45">
            {MAX_UPLOAD_SIZE_MB} MB max per file
          </p>
        </div>
      </div>
    </div>
  </SectionCard>
)
