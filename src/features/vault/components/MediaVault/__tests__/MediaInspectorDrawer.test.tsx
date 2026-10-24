/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaInspectorDrawer } from '../MediaInspectorDrawer';
import type { VaultItem } from '../../../../../lib/storage';
import { useIntegrityStore } from '../../../../../store/integrityStore';

// Mock clipboard and sonner
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock('../../../../../lib/merkleTree', () => ({
  computeBufferHash: vi.fn().mockImplementation((_data: any, algo: string) => {
    if (algo === 'blake3') return Promise.resolve('mock-blake3-photo-hash');
    return Promise.resolve('mock-sha256-photo-checksum');
  }),
}));

describe('MediaInspectorDrawer Component - Deep Details Photo & Video Inspection', () => {
  const mockPhotoItem: VaultItem = {
    id: 'test-photo-inspector-1',
    type: 'photo',
    title: 'HighRes_Landscape_Master.jpg',
    content: new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]),
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    folder: 'Vacation Photos',
    metadata: {
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 3840,
      height: 2160,
      aspectRatio: 16 / 9,
      size: 2500000, // ~2.5 MB
      sha256: 'mock-sha256-photo-checksum',
      integrity: {
        algorithm: 'blake3',
        hash: 'mock-blake3-photo-hash',
        verifiedAt: 1700000000000,
      },
      isE2EE: true,
      isLiveCapture: true,
    },
  };

  const mockVideoItem: VaultItem = {
    id: 'test-video-inspector-2',
    type: 'video',
    title: 'Cinematic_Recording_4k.mp4',
    content: new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]),
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    folder: 'Action Cam',
    metadata: {
      mimeType: 'video/mp4',
      extension: 'mp4',
      width: 3840,
      height: 2160,
      aspectRatio: 16 / 9,
      duration: 120, // 2 minutes
      size: 150000000, // ~150 MB -> 10 Mbps
      sha256: 'mock-sha256-video-checksum',
      integrity: {
        algorithm: 'blake3',
        hash: 'mock-blake3-video-hash',
        verifiedAt: 1700000000000,
      },
      transcript: 'Hello this is an encrypted speech test recording.',
      voiceClarityPreset: 'studio',
      isE2EE: true,
      isLiveCapture: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useIntegrityStore.setState({
      rootHash: 'mock-merkle-root-abc123456789',
    });
  });

  it('renders deep photo inspection details accurately (Specs tab)', () => {
    render(
      <MediaInspectorDrawer item={mockPhotoItem} isOpen={true} onClose={vi.fn()} type="photo" />,
    );

    // Header & Badges
    expect(screen.getByText('HighRes_Landscape_Master.jpg')).toBeTruthy();
    expect(screen.getByText(/photo deep inspector/i)).toBeTruthy();
    expect(screen.getAllByText('4K').length).toBeGreaterThan(0);
    expect(screen.getByText('Live Camera')).toBeTruthy();

    // Dimensions & Geometry
    expect(screen.getByText('3840 × 2160 px')).toBeTruthy();
    expect(screen.getByText('8.29 MP')).toBeTruthy();
    expect(screen.getByText('16 : 9 (Widescreen)')).toBeTruthy();
    expect(screen.getByText('Landscape (Horizontal)')).toBeTruthy();

    // Physical Print Matrix (72, 150, 300, 600 DPI)
    expect(screen.getByText(/72 DPI \(Web Screen\)/i)).toBeTruthy();
    expect(screen.getByText(/150 DPI \(Poster Size\)/i)).toBeTruthy();
    expect(screen.getByText(/300 DPI \(Gallery Print\)/i)).toBeTruthy();
    expect(screen.getByText(/600 DPI \(Archival Master\)/i)).toBeTruthy();
    expect(screen.getByText(/12.8" × 7.2"/i)).toBeTruthy();
    expect(screen.getByText(/25.6" × 14.4"/i)).toBeTruthy();

    // Screen Standard Benchmarks (FHD 400%, 4K 100%, 8K 25%)
    expect(screen.getByText(/Screen Standard Resolution Benchmarks/i)).toBeTruthy();
    expect(screen.getByText('400%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();

    // Album and MIME
    expect(screen.getByText('Vacation Photos')).toBeTruthy();
    expect(screen.getByText('image/jpeg')).toBeTruthy();
  });

  it('renders photo deep telemetry tab with compression ratio, VRAM footprint, and EXIF privacy audit', () => {
    render(
      <MediaInspectorDrawer item={mockPhotoItem} isOpen={true} onClose={vi.fn()} type="photo" />,
    );

    // Switch to Telemetry tab
    const telemetryTab = screen.getByRole('button', { name: /telemetry/i });
    fireEvent.click(telemetryTab);

    // Deep Compression & Pixel Density
    expect(screen.getByText(/Pixel Density & Compression Ratio/i)).toBeTruthy();
    expect(screen.getByText(/Bits Per Pixel \(BPP\)/i)).toBeTruthy();
    expect(screen.getByText(/GPU Framebuffer VRAM/i)).toBeTruthy();

    // EXIF Anti-Tracking Audit
    expect(screen.getByText(/EXIF Forensics & Anti-Tracking Audit/i)).toBeTruthy();
    expect(screen.getByText(/GPS Geolocation Tags/i)).toBeTruthy();
    expect(screen.getByText(/Stripped & Nullified/i)).toBeTruthy();
    expect(screen.getByText(/Scrubbed \(Zero Fingerprint\)/i)).toBeTruthy();
  });

  it('renders deep video inspection details accurately (Specs tab)', () => {
    render(
      <MediaInspectorDrawer item={mockVideoItem} isOpen={true} onClose={vi.fn()} type="video" />,
    );

    // Header & Badges
    expect(screen.getByText('Cinematic_Recording_4k.mp4')).toBeTruthy();
    expect(screen.getByText(/video deep inspector/i)).toBeTruthy();
    expect(screen.getAllByText('4K').length).toBeGreaterThan(0);

    // Temporal Specs
    expect(screen.getAllByText(/02:00/).length).toBeGreaterThan(0);
    expect(screen.getByText('10.00 Mbps')).toBeTruthy();

    // Broadcast Timecodes
    expect(screen.getByText('24 FPS Cinema')).toBeTruthy();
    expect(screen.getByText('30 FPS Web/TV')).toBeTruthy();
    expect(screen.getByText('60 FPS Smooth')).toBeTruthy();

    // Stream & Frame rates
    expect(screen.getByText(/Temporal Frame Dynamics & Timecodes/i)).toBeTruthy();
    expect(screen.getByText(/~3,600 frames/i)).toBeTruthy(); // 120s * 30fps
    expect(screen.getByText(/~7,200 frames/i)).toBeTruthy(); // 120s * 60fps
    expect(screen.getByText(/Stereo \(2 Channels\)/i)).toBeTruthy();
  });

  it('renders video deep telemetry tab with mobile data projection and live speech transcript', () => {
    render(
      <MediaInspectorDrawer item={mockVideoItem} isOpen={true} onClose={vi.fn()} type="video" />,
    );

    // Switch to Telemetry tab
    const telemetryTab = screen.getByRole('button', { name: /telemetry/i });
    fireEvent.click(telemetryTab);

    // Network Bandwidth Telemetry
    expect(screen.getByText(/Network Bandwidth & Consumption Telemetry/i)).toBeTruthy();
    expect(screen.getAllByText(/Data Consumption/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/~71.5 MB \/ min/i)).toBeTruthy(); // 150MB / 2 min = ~71.5 MB/min
    expect(screen.getByText(/Recommended Line/i)).toBeTruthy();

    // Projected Mobile Data Consumption
    expect(screen.getByText(/Projected Mobile Data Consumption/i)).toBeTruthy();
    expect(screen.getByText('10 min')).toBeTruthy();
    expect(screen.getByText('1 hour')).toBeTruthy();

    // Encrypted Speech Transcript & DSP
    expect(screen.getByText(/Encrypted Speech Transcript & DSP/i)).toBeTruthy();
    expect(screen.getByText('Hello this is an encrypted speech test recording.')).toBeTruthy();
    expect(screen.getByText(/Voice Clarity DSP: STUDIO/i)).toBeTruthy();
  });

  it('renders security tab with Shannon entropy, Magic Header hex dump, and handles integrity test', async () => {
    render(
      <MediaInspectorDrawer item={mockPhotoItem} isOpen={true} onClose={vi.fn()} type="photo" />,
    );

    // Switch to Security tab
    const securityTab = screen.getByRole('button', { name: /security/i });
    fireEvent.click(securityTab);

    expect(screen.getByText(/Cryptographic Vault Architecture/i)).toBeTruthy();
    expect(screen.getAllByText(/AES-256-GCM/i).length).toBeGreaterThan(0);
    expect(screen.getByText('mock-blake3-photo-hash')).toBeTruthy();
    expect(screen.getByText('mock-sha256-photo-checksum')).toBeTruthy();
    expect(screen.getByText('mock-merkle-root-abc123456789')).toBeTruthy();

    // Shannon Entropy Density Test
    expect(screen.getByText(/Shannon Entropy Density Test/i)).toBeTruthy();

    // Magic Header Hex Dump
    expect(screen.getByText(/Magic Bytes & File Header Signature/i)).toBeTruthy();
    expect(screen.getByText(/FF D8 FF E0/)).toBeTruthy();

    // Trigger Live Cryptographic Tamper Test
    const verifyBtn = screen.getByRole('button', { name: /verify now/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Hashes verified authentic/i)).toBeTruthy();
    });
  });

  it('renders raw JSON tab and allows searching metadata keys', () => {
    render(
      <MediaInspectorDrawer item={mockPhotoItem} isOpen={true} onClose={vi.fn()} type="photo" />,
    );

    // Switch to Raw tab
    const rawTab = screen.getByRole('button', { name: /raw json/i });
    fireEvent.click(rawTab);

    expect(screen.getByPlaceholderText(/filter json fields/i)).toBeTruthy();

    // Filter by 'width'
    const searchInput = screen.getByPlaceholderText(/filter json fields/i);
    fireEvent.change(searchInput, { target: { value: 'width' } });

    expect(screen.getByText(/"width": 3840/)).toBeTruthy();
  });

  it('copies full technical report to clipboard when copy report is clicked', async () => {
    render(
      <MediaInspectorDrawer item={mockVideoItem} isOpen={true} onClose={vi.fn()} type="video" />,
    );

    const copyReportButtons = screen.getAllByRole('button', {
      name: /copy.*report/i,
    });
    expect(copyReportButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyReportButtons[0]);

    expect(mockClipboard.writeText).toHaveBeenCalled();
    const textArg = mockClipboard.writeText.mock.calls[0][0];
    expect(textArg).toContain('VAULT SECURE MEDIA DEEP FORENSIC REPORT');
    expect(textArg).toContain('Cinematic_Recording_4k.mp4');
    expect(textArg).toContain('10.00 Mbps');
  });
});
