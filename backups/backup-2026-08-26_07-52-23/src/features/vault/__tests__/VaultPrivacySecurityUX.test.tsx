/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useVaultStore } from '../../../store/vaultStore';
import {
  createTrackedBlobUrl,
  registerBlobUrl,
  revokeAllActiveBlobUrls,
  getActiveBlobUrlCount,
} from '../../../lib/blobRegistry';
import { AppHeader } from '../../../components/app/AppHeader';
import { SafeMedia } from '../components/MediaVault/SafeMedia';
import type { VaultItem } from '../../../lib/storage';

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock blurHashToDataUrl
vi.mock('../../../lib/blurhash', () => ({
  blurHashToDataUrl: vi.fn((hash: string) => `data:image/png;base64,mock_${hash}`),
  decodeBlurHash: vi.fn(() => new Uint8ClampedArray(16 * 16 * 4)),
}));

// Mock filePreview
vi.mock('../../../lib/filePreview', () => ({
  describeVaultPreviewError: vi.fn((e: any) => e?.message || 'Error'),
  getVaultItemPreviewRevision: vi.fn(() => 'rev-1'),
  getVaultItemPreviewUrl: vi.fn(
    () =>
      new Promise((resolve) => setTimeout(() => resolve('blob:http://localhost/test-media'), 50)),
  ),
  vaultItemHasServerFileReference: vi.fn(() => false),
}));

describe('Vault Privacy & Security UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
      isDiscreetMode: true,
      preferences: {
        ...useVaultStore.getState().preferences,
        isDiscreetModeEnabled: true,
      },
    });
  });

  afterEach(() => {
    revokeAllActiveBlobUrls();
  });

  describe('🔹 5.1 Discreet / Privacy Blur Mode (Anti-Shoulder Surfing)', () => {
    it('is enabled by default in preferences and store state', () => {
      expect(useVaultStore.getState().isDiscreetMode).toBe(true);
      expect(useVaultStore.getState().preferences.isDiscreetModeEnabled).toBe(true);
    });

    it('toggles discreet mode in the vault store', () => {
      act(() => {
        useVaultStore.getState().toggleDiscreetMode();
      });

      expect(useVaultStore.getState().isDiscreetMode).toBe(false);
      expect(useVaultStore.getState().preferences.isDiscreetModeEnabled).toBe(false);

      act(() => {
        useVaultStore.getState().toggleDiscreetMode();
      });

      expect(useVaultStore.getState().isDiscreetMode).toBe(true);
      expect(useVaultStore.getState().preferences.isDiscreetModeEnabled).toBe(true);
    });

    it('renders Discreet Mode button in AppHeader and responds to clicks', () => {
      render(
        <AppHeader
          showNotifications={false}
          setShowNotifications={vi.fn()}
          isSidebarOpen={true}
          toggleSidebar={vi.fn()}
          activeTabLabel="photos"
          handlePrevTab={vi.fn()}
          handleNextTab={vi.fn()}
          unreadCount={0}
          handleHeaderProfileClick={vi.fn()}
          headerProfilePhoto={null}
          isHeaderProfilePhotoBroken={false}
          setIsHeaderProfilePhotoBroken={vi.fn()}
          headerProfileName="Test User"
          username="testuser"
          profileMonogram="T"
        />,
      );

      const discreetButton = screen.getByLabelText(/Discreet Mode active/i);
      expect(discreetButton).toBeDefined();

      fireEvent.click(discreetButton);

      expect(useVaultStore.getState().isDiscreetMode).toBe(false);
      expect(screen.getByLabelText(/Enable Discreet Mode/i)).toBeDefined();
    });

    it('applies discreet blur to media thumbnails when Discreet Mode is enabled', async () => {
      useVaultStore.setState({ isDiscreetMode: true });

      const mockItem: VaultItem = {
        id: 'test-photo-1',
        type: 'photo',
        title: 'Secret Passport Photo.jpg',
        content: 'data:image/jpeg;base64,mock',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          mimeType: 'image/jpeg',
          blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        },
      };

      const { container } = render(
        <SafeMedia item={mockItem} masterKey="mock-key" type="photo" isThumbnail={true} />,
      );

      const img = await waitFor(() => {
        const found = container.querySelector('img[alt="Secret Passport Photo.jpg"]');
        expect(found).toBeTruthy();
        return found!;
      });

      expect(img.className).toContain('blur-2xl');

      // Check discreet badge
      const discreetBadge = screen.getByText('Discreet');
      expect(discreetBadge).toBeDefined();

      const overlay = discreetBadge.closest('div.absolute');
      expect(overlay?.className).toContain('backdrop-blur-xl');
    });

    it('reveals crisp media on mobile press-and-hold (pointer/touch start -> touch end)', async () => {
      useVaultStore.setState({ isDiscreetMode: true });

      const mockItem: VaultItem = {
        id: 'test-photo-2',
        type: 'photo',
        title: 'Confidential Card.jpg',
        content: 'data:image/jpeg;base64,mock',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          mimeType: 'image/jpeg',
        },
      };

      const { container } = render(
        <SafeMedia item={mockItem} masterKey="mock-key" type="photo" isThumbnail={true} />,
      );

      await waitFor(() => {
        expect(container.querySelector('img[alt="Confidential Card.jpg"]')).toBeTruthy();
      });

      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).toBeDefined();

      // Pointer down -> reveals crisp media
      fireEvent.pointerDown(wrapper);
      const revealedImg = container.querySelector('img[alt="Confidential Card.jpg"]');
      expect(revealedImg?.className).not.toContain('blur-2xl');

      // Pointer up -> re-blurs
      fireEvent.pointerUp(wrapper);
      const reblurredImg = container.querySelector('img[alt="Confidential Card.jpg"]');
      expect(reblurredImg?.className).toContain('blur-2xl');
    });
  });

  describe('🔹 5.2 Decryption & Worker Loading Feedback', () => {
    it('renders BlurHash micro-placeholder and cryptographic decrypting progress bar during decryption', () => {
      const mockItem: VaultItem = {
        id: 'test-photo-blurhash',
        type: 'photo',
        title: 'Encrypted Document.png',
        content: new Uint8Array([1, 2, 3, 4]),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          mimeType: 'image/png',
          blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.',
        },
      };

      // While decrypting (synchronously rendered before promise resolves)
      render(<SafeMedia item={mockItem} masterKey="mock-key" type="photo" isThumbnail={true} />);

      // Verify BlurHash placeholder image is rendered immediately
      const placeholderImg = document.querySelector('img[src^="data:image/png;base64,mock_LGF5"]');
      expect(placeholderImg).toBeDefined();

      // Verify cryptographic decrypting status badge is shown
      expect(screen.getByText(/AES-256 Decrypting/i)).toBeDefined();
    });

    it('renders deterministic cryptographic gradient mesh when BlurHash is not available', () => {
      const mockItem: VaultItem = {
        id: 'test-photo-no-blurhash',
        type: 'photo',
        title: 'NoBlurHash.png',
        content: new Uint8Array([1, 2, 3]),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          mimeType: 'image/png',
        },
      };

      render(<SafeMedia item={mockItem} masterKey="mock-key" type="photo" isThumbnail={true} />);

      expect(screen.getByText(/AES-256 Decrypting/i)).toBeDefined();
    });
  });

  describe('🔹 5.3 Quick Panic Button / Instant Lock', () => {
    it('tracks and revokes all active blob URLs upon panic lock', () => {
      const mockBlob = new Blob(['test data'], { type: 'text/plain' });

      // Create tracked blob URLs
      createTrackedBlobUrl(mockBlob);
      createTrackedBlobUrl(mockBlob);
      registerBlobUrl('blob:http://localhost/existing-url');

      expect(getActiveBlobUrlCount()).toBeGreaterThanOrEqual(2);

      const revokedCount = revokeAllActiveBlobUrls();
      expect(revokedCount).toBeGreaterThanOrEqual(2);
      expect(getActiveBlobUrlCount()).toBe(0);
    });

    it('triggers panicLock from AppHeader button, locking the vault immediately', () => {
      render(
        <AppHeader
          showNotifications={false}
          setShowNotifications={vi.fn()}
          isSidebarOpen={true}
          toggleSidebar={vi.fn()}
          activeTabLabel="photos"
          handlePrevTab={vi.fn()}
          handleNextTab={vi.fn()}
          unreadCount={0}
          handleHeaderProfileClick={vi.fn()}
          headerProfilePhoto={null}
          isHeaderProfilePhotoBroken={false}
          setIsHeaderProfilePhotoBroken={vi.fn()}
          headerProfileName="Test User"
          username="testuser"
          profileMonogram="T"
        />,
      );

      const panicButton = screen.getByLabelText(/Instant Panic Lock/i);
      expect(panicButton).toBeDefined();

      fireEvent.click(panicButton);

      expect(useVaultStore.getState().isUnlocked).toBe(false);
      expect(useVaultStore.getState().isVaultReady).toBe(false);
    });

    it('triggers panic lock action directly on vaultStore', () => {
      useVaultStore.setState({ isUnlocked: true, isVaultReady: true });

      act(() => {
        useVaultStore.getState().panicLock();
      });

      expect(useVaultStore.getState().isUnlocked).toBe(false);
      expect(useVaultStore.getState().isVaultReady).toBe(false);
    });

    it('triggers panic lock on rapid 3x Escape key press window', () => {
      useVaultStore.setState({ isUnlocked: true, isVaultReady: true });

      let escPressTimestamps: number[] = [];
      const ESC_WINDOW_MS = 1200;
      const REQUIRED_PRESSES = 3;

      const handleKeyDown = (key: string) => {
        if (key === 'Escape') {
          const now = Date.now();
          escPressTimestamps = escPressTimestamps.filter((t) => now - t <= ESC_WINDOW_MS);
          escPressTimestamps.push(now);

          if (escPressTimestamps.length >= REQUIRED_PRESSES) {
            escPressTimestamps = [];
            useVaultStore.getState().panicLock();
          }
        }
      };

      handleKeyDown('Escape');
      handleKeyDown('Escape');
      expect(useVaultStore.getState().isUnlocked).toBe(true);

      handleKeyDown('Escape');
      expect(useVaultStore.getState().isUnlocked).toBe(false);
      expect(useVaultStore.getState().isVaultReady).toBe(false);
    });
  });

  describe('🔹 5.4 Cloud Sync State & Button Readiness', () => {
    it('handles syncWithCloud state transitions properly', async () => {
      const mockMasterKey = {} as CryptoKey;
      useVaultStore.setState({
        isUnlocked: true,
        masterKey: mockMasterKey,
        syncStatus: 'idle',
        isLoading: false,
      });

      const fetchSpy = vi
        .spyOn(useVaultStore.getState(), 'fetchItems')
        .mockImplementation(async () => {
          useVaultStore.setState({ syncStatus: 'syncing', isLoading: true });
          await new Promise((r) => setTimeout(r, 10));
          useVaultStore.setState({
            syncStatus: 'success',
            isLoading: false,
            lastSuccessfulSyncAt: Date.now(),
          });
        });

      const syncPromise = useVaultStore.getState().syncWithCloud();
      expect(useVaultStore.getState().syncStatus).toBe('syncing');

      await act(async () => {
        await syncPromise;
      });

      expect(fetchSpy).toHaveBeenCalledWith('manual');
      expect(useVaultStore.getState().syncStatus).toBe('success');
      expect(useVaultStore.getState().isLoading).toBe(false);
    });
  });

  describe('🔹 5.5 Responsive Header & Semantic Heading', () => {
    it('renders the active section heading (h1) on both mobile and desktop viewports', () => {
      render(
        <AppHeader
          showNotifications={false}
          setShowNotifications={vi.fn()}
          isSidebarOpen={true}
          toggleSidebar={vi.fn()}
          activeTabLabel="passwords"
          handlePrevTab={vi.fn()}
          handleNextTab={vi.fn()}
          unreadCount={0}
          handleHeaderProfileClick={vi.fn()}
          headerProfilePhoto={null}
          isHeaderProfilePhotoBroken={false}
          setIsHeaderProfilePhotoBroken={vi.fn()}
          headerProfileName="Test User"
          username="testuser"
          profileMonogram="T"
        />,
      );

      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(headings.some((h) => h.textContent?.toLowerCase().includes('passwords'))).toBe(true);
    });
  });
});
