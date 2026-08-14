import { describe, it, expect, beforeEach } from 'vitest';
import { useVaultStore } from '../../src/store/vaultStore';

describe('Privacy & Interface Zustand Store Suite', () => {
  beforeEach(() => {
    // Reset store preferences to default state before each test
    useVaultStore.setState({
      preferences: {
        isAutoLockEnabled: true,
        autoLockDuration: 5,
        isBlurOnTabHideEnabled: true,
        isLockOnTabHideEnabled: false,
        isClipboardAutoClearEnabled: true,
        clipboardAutoClearDuration: 30,
        isActivityLoggingEnabled: true,
        isMaskPasswordsEnabled: true,
        isFixedMaskLengthEnabled: false,
        isPurgeTrashOnLockEnabled: false,
        isRequireConfirmationOnDelete: true,
        isEphemeralSearchEnabled: false,
        isInlineMediaPreviewEnabled: true,
        isLightweightPreviewModeEnabled: false,
        isMediaAutoplayEnabled: true,
        isLowDataModeEnabled: false,
        isNetworkAwareAutoplayEnabled: true,
        isPerformanceHudEnabled: false,
        isLiveCaptureInfoEnabled: false,
        maxRecordingSizeMB: 500,
        generatedCredentialLength: 16,
        sidebarPosition: 'left',
        isRefreshConfirmationEnabled: true,
        isPhotoExifStripped: true,
        isVideoBufferingEnabled: true,
        isAudioWaveformEnabled: false,
      },
      allowRestrictedTypes: false,
    });
  });

  describe('Part 1: System Defaults Verification', () => {
    it('initial store state matches DEFAULT_PREFERENCES exactly', () => {
      const preferences = useVaultStore.getState().preferences;

      expect(preferences.isAutoLockEnabled).toBe(true);
      expect(preferences.autoLockDuration).toBe(5);
      expect(preferences.isBlurOnTabHideEnabled).toBe(true);
      expect(preferences.isLockOnTabHideEnabled).toBe(false);
      expect(preferences.isClipboardAutoClearEnabled).toBe(true);
      expect(preferences.clipboardAutoClearDuration).toBe(30);
      expect(preferences.isActivityLoggingEnabled).toBe(true);
      expect(preferences.isMaskPasswordsEnabled).toBe(true);
      expect(preferences.isFixedMaskLengthEnabled).toBe(false);
      expect(preferences.isPurgeTrashOnLockEnabled).toBe(false);
      expect(preferences.isRequireConfirmationOnDelete).toBe(true);
      expect(preferences.isEphemeralSearchEnabled).toBe(false);
      expect(preferences.isInlineMediaPreviewEnabled).toBe(true);
      expect(preferences.isLightweightPreviewModeEnabled).toBe(false);
      expect(preferences.isMediaAutoplayEnabled).toBe(true);
      expect(preferences.isLowDataModeEnabled).toBe(false);
      expect(preferences.isNetworkAwareAutoplayEnabled).toBe(true);
      expect(preferences.isPerformanceHudEnabled).toBe(false);
      expect(preferences.isLiveCaptureInfoEnabled).toBe(false);
      expect(preferences.maxRecordingSizeMB).toBe(500);
      expect(preferences.generatedCredentialLength).toBe(16);
      expect(preferences.sidebarPosition).toBe('left');
      expect(preferences.isRefreshConfirmationEnabled).toBe(true);
      expect(preferences.isPhotoExifStripped).toBe(true);
      expect(preferences.isVideoBufferingEnabled).toBe(true);
      expect(preferences.isAudioWaveformEnabled).toBe(false);
    });
  });

  describe('Part 2: Store Mutations & Toggles', () => {
    it('updates sidebarPosition', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({ sidebarPosition: 'right' });
      expect(useVaultStore.getState().preferences.sidebarPosition).toBe('right');
    });

    it('updates autoLock settings', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({ isAutoLockEnabled: false, autoLockDuration: 15 });
      expect(useVaultStore.getState().preferences.isAutoLockEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.autoLockDuration).toBe(15);
    });

    it('updates blur and lock on tab hide settings', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({ isBlurOnTabHideEnabled: false, isLockOnTabHideEnabled: true });
      expect(useVaultStore.getState().preferences.isBlurOnTabHideEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isLockOnTabHideEnabled).toBe(true);
    });

    it('updates clipboard auto-clear settings', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({ isClipboardAutoClearEnabled: false, clipboardAutoClearDuration: 45 });
      expect(useVaultStore.getState().preferences.isClipboardAutoClearEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.clipboardAutoClearDuration).toBe(45);
    });

    it('updates password masking and fixed mask length', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({ isMaskPasswordsEnabled: false, isFixedMaskLengthEnabled: true });
      expect(useVaultStore.getState().preferences.isMaskPasswordsEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isFixedMaskLengthEnabled).toBe(true);
    });

    it('updates purge trash, require delete confirmation, and ephemeral search', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({
        isPurgeTrashOnLockEnabled: true,
        isRequireConfirmationOnDelete: false,
        isEphemeralSearchEnabled: true,
      });
      expect(useVaultStore.getState().preferences.isPurgeTrashOnLockEnabled).toBe(true);
      expect(useVaultStore.getState().preferences.isRequireConfirmationOnDelete).toBe(false);
      expect(useVaultStore.getState().preferences.isEphemeralSearchEnabled).toBe(true);
    });

    it('updates EXIF stripping, media preview, and preview mode settings', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({
        isPhotoExifStripped: false,
        isInlineMediaPreviewEnabled: false,
        isLightweightPreviewModeEnabled: true,
      });
      expect(useVaultStore.getState().preferences.isPhotoExifStripped).toBe(false);
      expect(useVaultStore.getState().preferences.isInlineMediaPreviewEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isLightweightPreviewModeEnabled).toBe(true);
    });

    it('updates autoplay, low data mode, and network aware autoplay', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({
        isMediaAutoplayEnabled: false,
        isLowDataModeEnabled: true,
        isNetworkAwareAutoplayEnabled: false,
      });
      expect(useVaultStore.getState().preferences.isMediaAutoplayEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isLowDataModeEnabled).toBe(true);
      expect(useVaultStore.getState().preferences.isNetworkAwareAutoplayEnabled).toBe(false);
    });

    it('updates performance HUD, activity logging (Stealth Mode), and live capture info', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({
        isPerformanceHudEnabled: true,
        isActivityLoggingEnabled: false,
        isLiveCaptureInfoEnabled: true,
      });
      expect(useVaultStore.getState().preferences.isPerformanceHudEnabled).toBe(true);
      expect(useVaultStore.getState().preferences.isActivityLoggingEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isLiveCaptureInfoEnabled).toBe(true);
    });

    it('updates refresh confirmation, video buffering, and audio waveform', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({
        isRefreshConfirmationEnabled: false,
        isVideoBufferingEnabled: false,
        isAudioWaveformEnabled: true,
      });
      expect(useVaultStore.getState().preferences.isRefreshConfirmationEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isVideoBufferingEnabled).toBe(false);
      expect(useVaultStore.getState().preferences.isAudioWaveformEnabled).toBe(true);
    });
  });

  describe('Part 3: Numeric Input Sanitization & Bounds', () => {
    it('normalizes generatedCredentialLength within bounds', () => {
      const { updatePreferences } = useVaultStore.getState();

      updatePreferences({ generatedCredentialLength: 999 });
      expect(useVaultStore.getState().preferences.generatedCredentialLength).toBe(64);

      updatePreferences({ generatedCredentialLength: 2 });
      expect(useVaultStore.getState().preferences.generatedCredentialLength).toBe(16);

      updatePreferences({ generatedCredentialLength: 32 });
      expect(useVaultStore.getState().preferences.generatedCredentialLength).toBe(32);
    });

    it('updates maxRecordingSizeMB', () => {
      const { updatePreferences } = useVaultStore.getState();
      updatePreferences({ maxRecordingSizeMB: 1024 });
      expect(useVaultStore.getState().preferences.maxRecordingSizeMB).toBe(1024);
    });
  });
});
