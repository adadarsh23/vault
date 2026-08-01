import React, { memo } from 'react'
import { FileStack, Film, Image, Music, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card'
import { FILE_TYPE_SUPPORT, MAX_UPLOAD_SIZE_MB } from '../../../../lib/fileHandling'
import type { SecurityPreferences } from '../../../../store/vaultStore'
import { ToggleRow } from './ToggleRow'

interface FileHandlingCardProps {
  preferences: SecurityPreferences
  updatePreferences: (updates: Partial<SecurityPreferences>) => void
  allowRestrictedTypes: boolean
  setAllowRestrictedTypes: (value: boolean) => void
}

const supportRows = [
  {
    label: 'Photos',
    icon: Image,
    formats: FILE_TYPE_SUPPORT.photo.join(', '),
    preview: 'Secure image preview available',
  },
  {
    label: 'Videos',
    icon: Film,
    formats: FILE_TYPE_SUPPORT.video.join(', '),
    preview: 'Secure video preview available',
  },
  {
    label: 'Audio',
    icon: Music,
    formats: FILE_TYPE_SUPPORT.audio.join(', '),
    preview: 'Secure audio preview available',
  },
  {
    label: 'Documents',
    icon: FileStack,
    formats: FILE_TYPE_SUPPORT.document.join(', '),
    preview: 'Preview available for PDF, text, images, audio, and video files',
  },
] as const

export const FileHandlingCard: React.FC<FileHandlingCardProps> = memo(
  ({
    preferences,
    updatePreferences,
    allowRestrictedTypes,
    setAllowRestrictedTypes,
  }) => (
    <Card className="border-card-border bg-card-bg">
      <CardHeader>
        <CardTitle className="text-lg">File Handling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-text">
                Upload policy
              </p>
              <p className="text-xs text-text/50">
                Files larger than {MAX_UPLOAD_SIZE_MB} MB are blocked before upload.
              </p>
              <p className="text-xs text-text/50">
                Restricted executables and scripts are {allowRestrictedTypes ? 'allowed' : 'blocked'} by your current security setting.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text/35">
            Allowed upload types
          </p>
          <div className="space-y-2">
            {supportRows.map(({ label, icon: Icon, formats, preview }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3"
              >
                <div className="rounded-xl bg-white/5 p-2 text-text/60">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{label}</p>
                  <p className="text-xs leading-5 text-text/45">{formats}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-300/75">
                    {preview}
                  </p>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3">
              <p className="text-sm font-medium text-text">Other Files</p>
              <p className="text-xs leading-5 text-text/45">
                Archives, source files, installers, and miscellaneous files are allowed here. Dangerous executable/script types still follow the restricted-types setting.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleRow
            title="Allow restricted types"
            description="Permit executable, installer, and script uploads in file-oriented vaults"
            isActive={allowRestrictedTypes}
            activeColor="bg-amber-500"
            onToggle={setAllowRestrictedTypes}
          />

          <ToggleRow
            title="Inline media previews"
            description="Show lightweight preview players inside audio cards and keep media browsing rich"
            isActive={preferences.isInlineMediaPreviewEnabled}
            activeColor="bg-emerald-500"
            onToggle={(value) => updatePreferences({ isInlineMediaPreviewEnabled: value })}
          />

          <ToggleRow
            title="Lightweight preview mode"
            description="Reduce lag by using low-cost placeholders in media grids and deferring heavy preview decoding until you open an item."
            isActive={preferences.isLightweightPreviewModeEnabled}
            activeColor="bg-cyan-500"
            onToggle={(value) => updatePreferences({ isLightweightPreviewModeEnabled: value })}
          />

          <ToggleRow
            title="Autoplay media previews"
            description="Autoplay secure video previews after they are decrypted locally"
            isActive={preferences.isMediaAutoplayEnabled}
            activeColor="bg-violet-500"
            onToggle={(value) => updatePreferences({ isMediaAutoplayEnabled: value })}
          />

          <ToggleRow
            title="Low data mode (video)"
            description="Prefer lower preview bitrate/resolution to reduce lag and bandwidth."
            isActive={preferences.isLowDataModeEnabled}
            activeColor="bg-sky-500"
            onToggle={(value) => updatePreferences({ isLowDataModeEnabled: value })}
          />

          <ToggleRow
            title="Network-aware autoplay"
            description="Auto-disable autoplay on weak network or battery-constrained devices."
            isActive={preferences.isNetworkAwareAutoplayEnabled}
            activeColor="bg-amber-500"
            onToggle={(value) => updatePreferences({ isNetworkAwareAutoplayEnabled: value })}
          />

          <ToggleRow
            title="Performance HUD"
            description="Show live stream diagnostics (quality, buffer, dropped frames) during preview."
            isActive={preferences.isPerformanceHudEnabled}
            activeColor="bg-fuchsia-500"
            onToggle={(value) => updatePreferences({ isPerformanceHudEnabled: value })}
          />
        </div>

        {/* <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2 text-text/70">
              <Eye className="h-4 w-4" />
              <p className="text-sm font-medium text-text">Preview behavior</p>
            </div>
            <p className="text-xs leading-5 text-text/45">
              PDFs, text files, images, audio, and supported videos open in encrypted local previews when supported. Office files still need a download when no safe embedded preview is available.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2 text-text/70">
              <Download className="h-4 w-4" />
              <p className="text-sm font-medium text-text">Download behavior</p>
            </div>
            <p className="text-xs leading-5 text-text/45">
              Downloads are decrypted locally in the browser, saved with the original file name, and revoked from memory after the transfer finishes.
            </p>
          </div>
        </div> */}
      </CardContent>
    </Card>
  ),
)

FileHandlingCard.displayName = 'FileHandlingCard'
