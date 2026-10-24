/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { openDocumentInMobileApp } from '../../src/lib/fileHandling';
import { useAntiScreenshotAndShield } from '../../src/hooks/useAntiScreenshotAndShield';
import { PdfViewer } from '../../src/features/vault/components/PdfViewer/PdfViewer';
import React from 'react';

// Component to test useAntiScreenshotAndShield hook in DOM
const ShieldTestConsumer: React.FC<{
  isTabSwitchShieldEnabled?: boolean;
  isPrintBlockingEnabled?: boolean;
  isViewingSensitiveMedia?: boolean;
}> = (props) => {
  const { isShieldActive, shieldReason } = useAntiScreenshotAndShield(props);
  return (
    <div>
      <div data-testid="shield-active">{String(isShieldActive)}</div>
      <div data-testid="shield-reason">{shieldReason || 'none'}</div>
      <iframe data-testid="test-iframe" title="test-iframe" />
      <div className="pdf-viewer-container">
        <button data-testid="pdf-inner-button">PDF Button</button>
      </div>
    </div>
  );
};

describe('Mobile PDF and Document Handling', () => {
  const originalNavigator = { ...global.navigator };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('openDocumentInMobileApp', () => {
    it('calls navigator.share when canShare is supported', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      const canShareMock = vi.fn().mockReturnValue(true);

      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          share: shareMock,
          canShare: canShareMock,
        },
        configurable: true,
        writable: true,
      });

      const fallbackDownloadMock = vi.fn();
      const dummyContent = new Uint8Array([1, 2, 3, 4]);

      const result = await openDocumentInMobileApp({
        title: 'sample.pdf',
        content: dummyContent,
        mimeType: 'application/pdf',
        onFallbackDownload: fallbackDownloadMock,
      });

      expect(result).toBe(true);
      expect(canShareMock).toHaveBeenCalled();
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'sample.pdf',
          files: expect.any(Array),
        }),
      );
      expect(fallbackDownloadMock).not.toHaveBeenCalled();
    });

    it('falls back to window.open if navigator.share is unavailable but url is provided', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          share: undefined,
          canShare: undefined,
        },
        configurable: true,
        writable: true,
      });

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const fallbackDownloadMock = vi.fn();

      const result = await openDocumentInMobileApp({
        title: 'document.docx',
        url: 'blob:http://localhost/dummy-uuid',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        onFallbackDownload: fallbackDownloadMock,
      });

      expect(result).toBe(false);
      expect(fallbackDownloadMock).toHaveBeenCalled();
      openSpy.mockRestore();
    });

    it('triggers fallback download when sharing fails or errors', async () => {
      const shareMock = vi.fn().mockRejectedValue(new Error('Share failed'));
      const canShareMock = vi.fn().mockReturnValue(true);

      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          share: shareMock,
          canShare: canShareMock,
        },
        configurable: true,
        writable: true,
      });

      const fallbackDownloadMock = vi.fn();
      const dummyContent = new Uint8Array([5, 6, 7]);

      const result = await openDocumentInMobileApp({
        title: 'notes.txt',
        content: dummyContent,
        mimeType: 'text/plain',
        onFallbackDownload: fallbackDownloadMock,
      });

      expect(result).toBe(false);
      expect(fallbackDownloadMock).toHaveBeenCalled();
    });

    it('treats AbortError as successful user cancel without triggering download error', async () => {
      const abortError = new Error('User cancelled share');
      abortError.name = 'AbortError';
      const shareMock = vi.fn().mockRejectedValue(abortError);
      const canShareMock = vi.fn().mockReturnValue(true);

      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          share: shareMock,
          canShare: canShareMock,
        },
        configurable: true,
        writable: true,
      });

      const fallbackDownloadMock = vi.fn();
      const dummyContent = new Uint8Array([1, 2, 3]);

      const result = await openDocumentInMobileApp({
        title: 'presentation.pptx',
        content: dummyContent,
        onFallbackDownload: fallbackDownloadMock,
      });

      expect(result).toBe(true);
      expect(fallbackDownloadMock).not.toHaveBeenCalled();
    });
  });

  describe('useAntiScreenshotAndShield Mobile Protection', () => {
    it('does not trigger window.blur shield on mobile touch devices', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          maxTouchPoints: 5,
        },
        configurable: true,
        writable: true,
      });

      render(<ShieldTestConsumer isTabSwitchShieldEnabled={true} isViewingSensitiveMedia={true} />);

      expect(screen.getByTestId('shield-active').textContent).toBe('false');

      // Simulate window blur
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });

      // Shield should remain false on touch devices
      expect(screen.getByTestId('shield-active').textContent).toBe('false');
      expect(screen.getByTestId('shield-reason').textContent).toBe('none');
    });

    it('still activates shield on visibilitychange hidden on mobile', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          maxTouchPoints: 5,
        },
        configurable: true,
        writable: true,
      });

      render(<ShieldTestConsumer isTabSwitchShieldEnabled={true} isViewingSensitiveMedia={true} />);

      // Simulate switching away from app / tab hidden
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(screen.getByTestId('shield-active').textContent).toBe('true');
      expect(screen.getByTestId('shield-reason').textContent).toBe('tab-hidden');

      // Return to app
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(screen.getByTestId('shield-active').textContent).toBe('false');
    });
  });

  describe('PdfViewer Component', () => {
    it('renders PDF title, extension badge, and action controls', async () => {
      const downloadSpy = vi.fn();

      render(
        <PdfViewer
          url="blob:http://localhost/sample-pdf"
          title="Tax_Return_2025.pdf"
          extension="PDF"
          onDownload={downloadSpy}
        />,
      );

      expect(screen.getAllByText('Tax_Return_2025.pdf').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('PDF')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open in app/i })).toBeInTheDocument();
      expect(screen.getByTitle('Download PDF')).toBeInTheDocument();
    });

    it('triggers onDownload when download button is clicked', async () => {
      const downloadSpy = vi.fn();

      render(
        <PdfViewer
          url="blob:http://localhost/sample-pdf"
          title="Manual.pdf"
          extension="PDF"
          onDownload={downloadSpy}
        />,
      );

      const downloadButton = screen.getByTitle('Download PDF');
      fireEvent.click(downloadButton);

      expect(downloadSpy).toHaveBeenCalledTimes(1);
    });

    it('attempts native share when Open in App is clicked', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      const canShareMock = vi.fn().mockReturnValue(true);

      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          share: shareMock,
          canShare: canShareMock,
        },
        configurable: true,
        writable: true,
      });

      const dummyBytes = new Uint8Array([37, 80, 68, 70]); // %PDF

      render(
        <PdfViewer
          url="blob:http://localhost/sample-pdf"
          title="Encrypted_Doc.pdf"
          extension="PDF"
          fileContent={dummyBytes}
        />,
      );

      const openInAppButton = screen.getByRole('button', { name: /open in app/i });
      await act(async () => {
        fireEvent.click(openInAppButton);
      });

      await waitFor(() => {
        expect(shareMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Encrypted_Doc.pdf',
            files: expect.any(Array),
          }),
        );
      });
    });
  });
});
