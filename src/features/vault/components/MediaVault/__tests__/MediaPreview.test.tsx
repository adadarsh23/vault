/* @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaPreview } from '../MediaPreview';
import { useVaultStore } from '../../../../../store/vaultStore';
import type { VaultItem } from '../../../../../lib/storage';

// Mock dependencies
vi.mock('../SafeMedia', () => ({
  SafeMedia: ({ item, className }: { item: any; className?: string }) => (
    <div data-testid="safe-media" className={className}>
      <span>{item.title}</span>
    </div>
  ),
}));

vi.mock('../MediaFilmstrip', () => ({
  MediaFilmstrip: () => <div data-testid="media-filmstrip" />,
}));

vi.mock('../MediaInspectorDrawer', () => ({
  MediaInspectorDrawer: () => <div data-testid="media-inspector-drawer" />,
}));

vi.mock('../../../../../components/vault/GlobalNavigator', () => ({
  GlobalNavigator: () => <div data-testid="global-navigator" />,
}));

describe('MediaPreview Component - Photo Vault Production Readiness', () => {
  const mockPhotoItem: VaultItem = {
    id: 'test-photo-1',
    type: 'photo',
    title: 'Protected_Vacation.jpg',
    content: new Uint8Array([1, 2, 3]),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
      size: 2048,
    },
  };

  const defaultProps = {
    previewItem: 'test-photo-1',
    previewedMedia: mockPhotoItem,
    isPreparingPreview: false,
    masterKey: 'test-master-key',
    type: 'photo' as const,
    isMediaAutoplayEnabled: false,
    lowDataMode: false,
    isLowDataModeEnabled: false,
    isNetworkAwareAutoplayEnabled: false,
    isPerformanceHudEnabled: false,
    canPrevious: true,
    canNext: true,
    onClose: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onDownload: vi.fn(),
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    modalRef: React.createRef<HTMLDivElement>(),
    allItems: [mockPhotoItem],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 0;
    });
    useVaultStore.setState({
      isUnlocked: true,
      isVaultReady: true,
      preferences: {
        ...useVaultStore.getState().preferences,
        isPrintBlockingEnabled: true,
        isTabSwitchShieldEnabled: true,
        isForensicWatermarkEnabled: true,
      },
    });
  });

  it('renders photo media without any watermark overlay', () => {
    render(<MediaPreview {...defaultProps} />);

    // SafeMedia should be rendered
    expect(screen.getByTestId('safe-media')).toBeTruthy();
    expect(screen.getAllByText('Protected_Vacation.jpg').length).toBeGreaterThan(0);

    // Forensic watermark overlay MUST NOT be present in Photo Vault preview
    const watermark = screen.queryByTestId('forensic-watermark');
    expect(watermark).toBeNull();
  });

  it('renders top action bar controls and handles close action', () => {
    render(<MediaPreview {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    expect(closeButtons.length).toBeGreaterThan(0);

    fireEvent.click(closeButtons[0]);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles keyboard navigation shortcuts (Escape, ArrowLeft, ArrowRight)', () => {
    render(<MediaPreview {...defaultProps} />);

    // ArrowLeft -> Previous
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(defaultProps.onPrevious).toHaveBeenCalled();

    // ArrowRight -> Next
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(defaultProps.onNext).toHaveBeenCalled();

    // Escape -> Close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('renders zoom, rotate, and inspector toggle tools for photo preview', () => {
    render(<MediaPreview {...defaultProps} />);

    // Zoom controls and tools should be present
    expect(screen.getByTitle(/Zoom In/i)).toBeTruthy();
    expect(screen.getByTitle(/Zoom Out/i)).toBeTruthy();
    expect(screen.getAllByTitle(/Rotate/i).length).toBeGreaterThan(0);
    expect(screen.getByTitle(/Metadata/i)).toBeTruthy();
  });

  it('triggers download callback when download button is clicked', () => {
    render(<MediaPreview {...defaultProps} />);

    const downloadBtn = screen.getByTitle(/Download/i);
    fireEvent.click(downloadBtn);

    expect(defaultProps.onDownload).toHaveBeenCalledWith(mockPhotoItem);
  });
});
