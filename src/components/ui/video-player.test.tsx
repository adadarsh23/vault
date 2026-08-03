/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoPlayer, {
  getHlsRecoveryAction,
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

describe('VideoPlayer phase 1 controls', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores resume position from localStorage after metadata loads', () => {
    const key = 'vault:video:resume:item-123';
    window.localStorage.setItem(key, '42');

    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/video.mp4" itemId="item-123" />
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 120,
    });

    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(42);
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
      <VideoPlayer src="https://cdn.example.com/video.mp4" allowPiP={false} />
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
      />
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
