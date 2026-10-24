/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  OtherFilesVault,
  getFileCategory,
  getCategoryIcon,
  extractAudioDuration,
  extractImageDimensions,
} from '../../src/features/vault/OtherFilesVault';
import { useVaultStore } from '../../src/store/vaultStore';
import { VaultItem } from '../../src/lib/storage';

// Mock UI and sub-components
vi.mock('../../src/components/ui/video-player', () => ({
  default: () => <div data-testid="mock-video-player">Mock Video Player</div>,
  getMimeTypeFromUrl: () => 'video/mp4',
}));

vi.mock('../../src/components/ui/audio-player', () => ({
  AudioPlayer: ({ title }: { title: string }) => (
    <div data-testid="mock-audio-player">Mock Audio Player - {title}</div>
  ),
}));

vi.mock('../../src/components/vault/DecryptedMarkdown', () => ({
  DecryptedMarkdown: ({ content }: { content: string }) => (
    <div data-testid="mock-decrypted-markdown">{content}</div>
  ),
}));

vi.mock('../../src/features/vault/components/PdfViewer/PdfViewer', () => ({
  PdfViewer: ({ title }: { title: string }) => (
    <div data-testid="mock-pdf-viewer">Mock PDF Viewer - {title}</div>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../../src/lib/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../../src/lib/cryptoPrimitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/cryptoPrimitives')>();
  return {
    ...actual,
    encryptFileInWorker: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    decryptData: vi.fn().mockResolvedValue('decrypted content'),
  };
});

vi.mock('../../src/lib/filePreview', () => ({
  getVaultItemFileUrl: vi.fn().mockReturnValue(null),
  getVaultItemPreviewUrl: vi.fn().mockImplementation(async (_item: VaultItem) => {
    return 'blob:http://localhost/mock-preview-url';
  }),
  describeVaultPreviewError: vi.fn().mockReturnValue('Error decrypting preview'),
  getVaultItemPreviewRevision: vi.fn().mockReturnValue('rev-123'),
  getCachedMediaBlobUrl: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/lib/blobRegistry', () => ({
  revokeBlobUrl: vi.fn(),
  registerBlobUrl: vi.fn((url) => url),
  createTrackedBlobUrl: vi.fn((_blob) => 'blob:mock'),
}));

describe('OtherFilesVault Category Detection', () => {
  it('accurately classifies code extensions', () => {
    expect(getFileCategory('ts')).toBe('code');
    expect(getFileCategory('tsx')).toBe('code');
    expect(getFileCategory('js')).toBe('code');
    expect(getFileCategory('py')).toBe('code');
    expect(getFileCategory('rs')).toBe('code');
    expect(getFileCategory('go')).toBe('code');
    expect(getFileCategory('cpp')).toBe('code');
    expect(getFileCategory('html')).toBe('code');
    expect(getFileCategory('css')).toBe('code');
  });

  it('accurately classifies config extensions', () => {
    expect(getFileCategory('json')).toBe('config');
    expect(getFileCategory('yaml')).toBe('config');
    expect(getFileCategory('yml')).toBe('config');
    expect(getFileCategory('toml')).toBe('config');
    expect(getFileCategory('env')).toBe('config');
    expect(getFileCategory('xml')).toBe('config');
  });

  it('accurately classifies csv and tabular extensions', () => {
    expect(getFileCategory('csv')).toBe('csv');
    expect(getFileCategory('tsv')).toBe('csv');
    expect(getFileCategory('psv')).toBe('csv');
  });

  it('accurately classifies markdown and document extensions', () => {
    expect(getFileCategory('md')).toBe('markdown');
    expect(getFileCategory('markdown')).toBe('markdown');
    expect(getFileCategory('pdf')).toBe('pdf');
    expect(getFileCategory('txt')).toBe('text');
  });

  it('accurately classifies media, archive and binary extensions', () => {
    expect(getFileCategory('png')).toBe('image');
    expect(getFileCategory('mp3')).toBe('audio');
    expect(getFileCategory('mp4')).toBe('video');
    expect(getFileCategory('zip')).toBe('archive');
    expect(getFileCategory('tar')).toBe('archive');
    expect(getFileCategory('exe')).toBe('executable');
    expect(getFileCategory('sqlite')).toBe('database');
    expect(getFileCategory('iso')).toBe('disk-image');
    expect(getFileCategory('woff2')).toBe('font');
    expect(getFileCategory('unknownxyz')).toBe('generic');
  });

  it('returns valid React element icons for all categories', () => {
    const categories = [
      'code',
      'config',
      'csv',
      'markdown',
      'text',
      'pdf',
      'image',
      'audio',
      'video',
      'archive',
      'executable',
      'database',
      'disk-image',
      'font',
      '3d',
      'generic',
    ] as const;

    for (const cat of categories) {
      const icon = getCategoryIcon(cat);
      expect(React.isValidElement(icon)).toBe(true);
    }
  });
});

describe('Audio and Image Metadata Extraction Helpers', () => {
  it('extractAudioDuration handles mock audio file gracefully', async () => {
    const file = new File(['dummy audio content'], 'sample.mp3', { type: 'audio/mpeg' });
    const durationPromise = extractAudioDuration(file);
    expect(durationPromise).toBeInstanceOf(Promise);
    const duration = await durationPromise;
    expect(duration === undefined || typeof duration === 'number').toBe(true);
  });

  it('extractImageDimensions handles mock image file gracefully', async () => {
    const file = new File(['dummy image content'], 'sample.png', { type: 'image/png' });
    const dimPromise = extractImageDimensions(file);
    expect(dimPromise).toBeInstanceOf(Promise);
    const dim = await dimPromise;
    expect(
      dim === undefined || (typeof dim.width === 'number' && typeof dim.height === 'number'),
    ).toBe(true);
  });
});

describe('OtherFilesVault Component', () => {
  const mockMasterKey = 'mock-master-key-32-bytes-test!!' as unknown as CryptoKey;

  const mockFiles: VaultItem[] = [
    {
      id: 'file-1',
      type: 'file',
      title: 'config.json',
      content: new Uint8Array([1, 2, 3]),
      createdAt: 1729760000000,
      updatedAt: 1729760000000,
      metadata: {
        size: 1024,
        extension: 'JSON',
        mimeType: 'application/json',
      },
    },
    {
      id: 'file-2',
      type: 'file',
      title: 'script.py',
      content: new Uint8Array([4, 5, 6]),
      createdAt: 1729763600000,
      updatedAt: 1729763600000,
      folder: 'scripts',
      metadata: {
        size: 2048,
        extension: 'PY',
        mimeType: 'text/x-python',
      },
    },
    {
      id: 'file-3',
      type: 'file',
      title: 'soundtrack.mp3',
      content: new Uint8Array([7, 8, 9]),
      createdAt: 1729767200000,
      updatedAt: 1729767200000,
      metadata: {
        size: 5120000,
        extension: 'MP3',
        mimeType: 'audio/mpeg',
        duration: 180,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      items: mockFiles,
      masterKey: mockMasterKey,
      pinningItemIds: [],
      preferences: {
        ...useVaultStore.getState().preferences,
        isAudioWaveformEnabled: true,
        isPhotoExifStripped: true,
        isTabSwitchShieldEnabled: true,
        isPrintBlockingEnabled: true,
      },
    });
  });

  it('renders files in vault correctly with cards, titles, and sizes', () => {
    render(<OtherFilesVault />);

    expect(screen.getByText('config.json')).toBeInTheDocument();
    expect(screen.getByText('script.py')).toBeInTheDocument();
    expect(screen.getByText('soundtrack.mp3')).toBeInTheDocument();
    expect(screen.getByText('1.00 KB')).toBeInTheDocument();
    expect(screen.getByText('2.00 KB')).toBeInTheDocument();
    expect(screen.getByText('4.88 MB')).toBeInTheDocument();
  });

  it('shows empty state when no files match', () => {
    useVaultStore.setState({ items: [] });
    render(<OtherFilesVault />);

    expect(screen.getByText('No files found.')).toBeInTheDocument();
    expect(screen.getByText(/Tap or drop files to upload securely/i)).toBeInTheDocument();
  });

  it('filters files when searching', async () => {
    render(<OtherFilesVault />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'script' } });

    await waitFor(() => {
      expect(screen.getByText('script.py')).toBeInTheDocument();
      expect(screen.queryByText('config.json')).not.toBeInTheDocument();
      expect(screen.queryByText('soundtrack.mp3')).not.toBeInTheDocument();
    });
  });

  it('opens preview modal when clicking preview button', async () => {
    render(<OtherFilesVault />);

    const previewButtons = screen.getAllByRole('button', { name: /preview/i });
    fireEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(screen.getByTitle(/Close preview \(Esc\)/i)).toBeInTheDocument();
    });
  });

  it('allows pinning and unpinning items', async () => {
    const togglePinSpy = vi.fn();
    useVaultStore.setState({ togglePin: togglePinSpy });

    render(<OtherFilesVault />);

    const pinButtons = screen.getAllByTitle(/pin/i);
    fireEvent.click(pinButtons[0]);

    expect(togglePinSpy).toHaveBeenCalledWith('file-3');
  });

  it('allows deleting items after confirmation', async () => {
    const removeItemSpy = vi.fn();
    useVaultStore.setState({ removeItem: removeItemSpy });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OtherFilesVault />);

    const deleteButtons = screen.getAllByTitle(/delete/i);
    fireEvent.click(deleteButtons[0]);

    expect(removeItemSpy).toHaveBeenCalledWith('file-3');
  });
});
