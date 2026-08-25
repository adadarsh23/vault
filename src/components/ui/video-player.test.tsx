/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer, {
  CustomSlider,
  formatTime,
  getHlsRecoveryAction,
  getMimeTypeFromUrl,
  getPlayerErrorMessage,
  mapMediaErrorCodeToPlayerError,
  sanitizeTelemetryMetadata,
} from './video-player';

vi.mock('hls.js', () => ({
  default: {
    isSupported: () => false,
    ErrorTypes: {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
    },
  },
}));

vi.mock('../../lib/videoTranscoder', () => ({
  transcodeVideoInBrowser: vi.fn().mockResolvedValue({
    url: 'blob:mock-transcoded-url',
    blob: new Blob([], { type: 'video/mp4' }),
  }),
}));

describe('VideoPlayer phase 1 controls', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts playback cleanly from the beginning (0s) after metadata loads', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/video.mp4" itemId="item-123" />,
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 120,
    });

    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0);
  });

  it('requests fullscreen when fullscreen button is clicked', async () => {
    const requestFullscreenMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });

    render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    fireEvent.click(screen.getByRole('button', { name: /enter fullscreen/i }));

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it('requests PiP on video when PiP button is clicked', async () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    };
    const requestPiPMock = vi
      .fn<() => Promise<PictureInPictureWindow>>()
      .mockResolvedValue({} as PictureInPictureWindow);
    (
      video as HTMLVideoElement & {
        requestPictureInPicture: () => Promise<PictureInPictureWindow>;
      }
    ).requestPictureInPicture = requestPiPMock;

    fireEvent.click(screen.getByRole('button', { name: /picture in picture/i }));
    expect(requestPiPMock).toHaveBeenCalledTimes(1);
  });

  it('disables download button when allowDownload is false', () => {
    render(<VideoPlayer src="https://cdn.example.com/video.mp4" allowDownload={false} />);
    expect(screen.getByRole('button', { name: /download video/i })).toBeDisabled();
  });

  it('disables speed control when allowSpeedChange is false', () => {
    render(<VideoPlayer src="https://cdn.example.com/video.mp4" allowSpeedChange={false} />);
    expect(screen.getByRole('button', { name: /playback speed/i })).toBeDisabled();
  });

  it('does not request fullscreen when policy disallows fullscreen', () => {
    const requestFullscreenMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });

    render(<VideoPlayer src="https://cdn.example.com/video.mp4" allowFullscreen={false} />);
    const fullscreenButton = screen.getByRole('button', {
      name: /enter fullscreen/i,
    });
    expect(fullscreenButton).toBeDisabled();
    fireEvent.click(fullscreenButton);
    expect(requestFullscreenMock).toHaveBeenCalledTimes(0);
  });

  it('does not request PiP when policy disallows PiP', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/video.mp4" allowPiP={false} />,
    );
    const video = container.querySelector('video') as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    };
    const requestPiPMock = vi
      .fn<() => Promise<PictureInPictureWindow>>()
      .mockResolvedValue({} as PictureInPictureWindow);
    (
      video as HTMLVideoElement & {
        requestPictureInPicture: () => Promise<PictureInPictureWindow>;
      }
    ).requestPictureInPicture = requestPiPMock;

    const pipButton = screen.getByRole('button', { name: /picture in picture/i });
    expect(pipButton).toBeDisabled();
    fireEvent.click(pipButton);
    expect(requestPiPMock).toHaveBeenCalledTimes(0);
  });

  it('blocks playback when source domain is not in allowlist', () => {
    render(
      <VideoPlayer
        src="https://evil.example.com/video.mp4"
        allowedMediaDomains={['cdn.example.com']}
      />,
    );
    expect(screen.getByText(/media url is not allowed by security policy/i)).toBeInTheDocument();
  });

  it('toggles mute state when mute control is clicked', () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" autoPlay />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.muted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /mute/i }));
    expect(video.muted).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /unmute/i }));
    expect(video.muted).toBe(false);
    expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
  });

  it('updates dynamic aspect ratio when video metadata is loaded', () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();

    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1080 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1920 });

    fireEvent.loadedMetadata(video);

    const playerContainer = container.firstElementChild as HTMLElement;
    expect(playerContainer.style.aspectRatio).toContain('0.5625');
  });

  it('renders helpful error UI with Convert (WASM), Download and Retry buttons when format is unsupported', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/video.mkv" title="Sample Video" />,
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();

    Object.defineProperty(video, 'error', {
      configurable: true,
      value: { code: 4, message: 'Format error' },
    });

    fireEvent.error(video);

    expect(screen.getByText(/video format not supported/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /convert and play in browser/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /download video/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /retry playback/i })).toBeInTheDocument();
  });
});

describe('sanitizeTelemetryMetadata', () => {
  it('redacts URL query tokens and sensitive string fields', () => {
    const payload = {
      src: 'https://cdn.example.com/video.m3u8?token=abc123&sig=xyz',
      nested: { authorization: 'Bearer supersecrettoken' },
    };
    const sanitized = sanitizeTelemetryMetadata(payload) as {
      src: string;
      nested: { authorization: string };
    };
    expect(sanitized.src).toBe('https://cdn.example.com/video.m3u8');
    expect(sanitized.nested.authorization).toContain('[REDACTED]');
  });
});

describe('player error taxonomy', () => {
  it('maps HTML media errors to normalized player errors', () => {
    expect(mapMediaErrorCodeToPlayerError(4)).toBe('UNSUPPORTED_FORMAT');
    expect(mapMediaErrorCodeToPlayerError(3)).toBe('MEDIA_DECODE_FAILED');
    expect(mapMediaErrorCodeToPlayerError(2)).toBe('PLAYBACK_FAILED');
  });

  it('returns user-facing message by error code', () => {
    expect(getPlayerErrorMessage('NETWORK_UNSTABLE')).toMatch(/network unstable/i);
  });
});

describe('hls recovery ladder', () => {
  it('uses exponential backoff for network errors', () => {
    const action = getHlsRecoveryAction({
      errorType: 'networkError',
      networkRetryCount: 3,
      mediaRecoveryCount: 0,
      currentLevel: 2,
    });
    expect(action.action).toBe('restart_load');
    if (action.action === 'restart_load') {
      expect(action.retryInMs).toBe(4000);
    }
  });

  it('downgrades quality after repeated media errors', () => {
    const action = getHlsRecoveryAction({
      errorType: 'mediaError',
      networkRetryCount: 0,
      mediaRecoveryCount: 3,
      currentLevel: 3,
    });
    expect(action).toMatchObject({ action: 'downgrade_level', level: 2 });
  });
});

describe('getMimeTypeFromUrl', () => {
  it('resolves correct MIME types for video extensions', () => {
    expect(getMimeTypeFromUrl('https://example.com/file.mp4')).toBe('video/mp4');
    expect(getMimeTypeFromUrl('https://example.com/file.mkv')).toBe('video/x-matroska');
    expect(getMimeTypeFromUrl('https://example.com/file.webm')).toBe('video/webm');
    expect(getMimeTypeFromUrl('https://example.com/file.mov')).toBe('video/quicktime');
    expect(getMimeTypeFromUrl('https://example.com/file.avi')).toBe('video/x-msvideo');
    expect(getMimeTypeFromUrl('https://example.com/file.unknown')).toBeUndefined();
  });
});

describe('VideoPlayer Polish Enhancements', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders quick speed selector popup and changes playback rate', () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;

    // Initially 1x
    const speedButton = screen.getByRole('button', { name: /playback speed: 1x/i });
    expect(speedButton).toBeInTheDocument();

    // Click speed button to open popover
    fireEvent.click(speedButton);

    const popup = screen.getByTestId('speed-selector-popup');
    expect(popup).toBeInTheDocument();

    // Select 1.5x
    const speed15Btn = screen.getByRole('button', { name: '1.5x' });
    fireEvent.click(speed15Btn);

    expect(video.playbackRate).toBe(1.5);
    expect(screen.getByRole('button', { name: /playback speed: 1.5x/i })).toBeInTheDocument();
  });

  it('toggles looping mode and updates video.loop attribute', () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(video.loop).toBe(false);

    // Click Loop button
    const loopBtn = screen.getByRole('button', { name: /enable loop/i });
    fireEvent.click(loopBtn);

    expect(video.loop).toBe(true);
    expect(screen.getByRole('button', { name: /disable loop/i })).toBeInTheDocument();

    // Click again to disable
    fireEvent.click(screen.getByRole('button', { name: /disable loop/i }));
    expect(video.loop).toBe(false);
  });

  it('handles double-tap skip on left (-10s) and right (+10s) sides', () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.currentTime = 50;

    const gestureArea = screen.getByTestId('video-gesture-area');
    Object.defineProperty(gestureArea, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 400, top: 0, height: 300 }),
    });

    // Double tap right side (clientX = 300) -> +10s
    fireEvent.click(gestureArea, { clientX: 300 });
    fireEvent.click(gestureArea, { clientX: 300 });

    expect(video.currentTime).toBe(60);

    // Double tap left side (clientX = 100) -> -10s
    fireEvent.click(gestureArea, { clientX: 100 });
    fireEvent.click(gestureArea, { clientX: 100 });

    expect(video.currentTime).toBe(50);
  });

  it('handles keyboard shortcuts for play/pause, seeking, mute, looping, and speed', () => {
    const { container } = render(<VideoPlayer src="https://cdn.example.com/video.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    video.currentTime = 20;

    const playMock = vi.spyOn(video, 'play').mockResolvedValue();
    vi.spyOn(video, 'pause').mockImplementation(() => {});

    // Space / K -> toggle play
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    fireEvent.keyDown(window, { key: ' ' });
    expect(playMock).toHaveBeenCalled();

    // J -> -10s
    fireEvent.keyDown(window, { key: 'j' });
    expect(video.currentTime).toBe(10);

    // L -> +10s
    fireEvent.keyDown(window, { key: 'l' });
    expect(video.currentTime).toBe(20);

    // M -> Mute toggle
    fireEvent.keyDown(window, { key: 'm' });
    expect(video.muted).toBe(true);

    // R -> Loop toggle
    fireEvent.keyDown(window, { key: 'r' });
    expect(video.loop).toBe(true);

    // Number keys: '5' -> 50%
    fireEvent.keyDown(window, { key: '5' });
    expect(video.currentTime).toBe(50);

    // Speed hotkeys: ']' increases speed
    fireEvent.keyDown(window, { key: ']' });
    expect(video.playbackRate).toBe(1.25);
  });

  it('toggles mini floating player mode', () => {
    render(<VideoPlayer src="https://cdn.example.com/video.mp4" title="My Test Video" />);

    // Click floating mini player button
    const floatBtn = screen.getByRole('button', { name: /floating mini player/i });
    fireEvent.click(floatBtn);

    // In floating mode, title in header and restore button should be present
    expect(screen.getByRole('button', { name: /restore standard/i })).toBeInTheDocument();

    // Click restore
    fireEvent.click(screen.getByRole('button', { name: /restore standard/i }));
    expect(screen.getByRole('button', { name: /floating mini player/i })).toBeInTheDocument();
  });

  it('renders hover preview tooltip on timeline slider pointer move', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <CustomSlider label="Seek video" value={25} duration={120} onChange={handleChange} />,
    );

    const slider = container.querySelector('[role="slider"]') as HTMLElement;
    expect(slider).toBeInTheDocument();

    Object.defineProperty(slider, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 200, top: 0, height: 10 }),
    });

    // Pointer move at 50% (x=100) -> 60s (01:00)
    fireEvent.pointerEnter(slider);
    fireEvent.pointerMove(slider, { clientX: 100 });

    const tooltip = screen.getByTestId('timeline-scrub-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain('01:00');
  });

  it('triggers snapshot frame capture when snapshot button is clicked', () => {
    render(<VideoPlayer src="https://cdn.example.com/video.mp4" title="Sample" />);

    const snapBtn = screen.getByRole('button', { name: /capture snapshot frame/i });
    expect(snapBtn).toBeInTheDocument();
    fireEvent.click(snapBtn);
  });
});

describe('formatTime helper', () => {
  it('formats seconds into mm:ss and hh:mm:ss appropriately', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(3665)).toBe('01:01:05');
    expect(formatTime(NaN)).toBe('00:00');
    expect(formatTime(-10)).toBe('00:00');
  });
});
