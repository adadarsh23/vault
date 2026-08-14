/* @vitest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileExperienceCard } from '../../components/SettingsVault/MobileExperienceCard';
import { PWAInstallModal } from '../../../../components/vault/PWAInstallModal';

describe('Mobile & PWA Experience Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MobileExperienceCard', () => {
    it('renders Mobile Experience title and description', () => {
      render(
        <MobileExperienceCard
          isInstalled={false}
          isStandalone={false}
          needsManualInstall={false}
          canInstall={true}
          onInstallRequest={vi.fn()}
        />
      );

      expect(screen.getByText('Mobile Experience')).toBeTruthy();
      expect(screen.getByText('Progressive Web App')).toBeTruthy();
    });

    it('triggers onInstallRequest when "Add to Home Screen" button is clicked', () => {
      const onInstallRequestMock = vi.fn();

      render(
        <MobileExperienceCard
          isInstalled={false}
          isStandalone={false}
          needsManualInstall={false}
          canInstall={true}
          onInstallRequest={onInstallRequestMock}
        />
      );

      const installButton = screen.getByRole('button', { name: /add to home screen/i });
      fireEvent.click(installButton);

      expect(onInstallRequestMock).toHaveBeenCalledTimes(1);
    });

    it('triggers onInstallRequest when "Live Preview & Widgets" button is clicked', () => {
      const onInstallRequestMock = vi.fn();

      render(
        <MobileExperienceCard
          isInstalled={false}
          isStandalone={false}
          needsManualInstall={false}
          canInstall={false}
          onInstallRequest={onInstallRequestMock}
        />
      );

      const previewButton = screen.getByRole('button', { name: /live preview & widgets/i });
      fireEvent.click(previewButton);

      expect(onInstallRequestMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('PWAInstallModal', () => {
    it('executes onInstall callback when "Install Vault" button is clicked', () => {
      const onInstallMock = vi.fn().mockResolvedValue(undefined);
      const onCloseMock = vi.fn();

      render(
        <PWAInstallModal
          isOpen={true}
          onClose={onCloseMock}
          onInstall={onInstallMock}
          isInstalled={false}
        />
      );

      const installButton = screen.getByRole('button', { name: /install vault/i });
      fireEvent.click(installButton);

      expect(onInstallMock).toHaveBeenCalledTimes(1);
    });

    it('disables "Install Vault" button when isInstalled is true', () => {
      render(
        <PWAInstallModal isOpen={true} onClose={vi.fn()} onInstall={vi.fn()} isInstalled={true} />
      );

      const installedButton = screen.getByRole('button', { name: /already installed/i });
      expect(installedButton.hasAttribute('disabled')).toBe(true);
    });

    it('calls onClose when "Maybe Later" button is clicked', () => {
      const onCloseMock = vi.fn();

      render(
        <PWAInstallModal
          isOpen={true}
          onClose={onCloseMock}
          onInstall={vi.fn()}
          isInstalled={false}
        />
      );

      const maybeLaterButton = screen.getByRole('button', { name: /maybe later/i });
      fireEvent.click(maybeLaterButton);

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close X button is clicked', () => {
      const onCloseMock = vi.fn();

      render(
        <PWAInstallModal
          isOpen={true}
          onClose={onCloseMock}
          onInstall={vi.fn()}
          isInstalled={false}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close modal/i });
      fireEvent.click(closeButton);

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
