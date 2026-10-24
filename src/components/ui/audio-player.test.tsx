/* @vitest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer, formatTime, CustomSlider, isSafeDownloadUrl } from './audio-player';

describe('formatTime', () => {
  it('formats seconds into MM:SS format', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(45)).toBe('0:45');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(599)).toBe('9:59');
  });

  it('formats hours into H:MM:SS format when over 1 hour', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
    expect(formatTime(7322)).toBe('2:02:02');
  });

  it('gracefully handles negative, NaN, and non-finite values', () => {
    expect(formatTime(-10)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-Infinity)).toBe('0:00');
  });
});

describe('isSafeDownloadUrl', () => {
  it('allows http, https, blob and data URLs', () => {
    expect(isSafeDownloadUrl('https://example.com/audio.mp3')).toBe(true);
    expect(isSafeDownloadUrl('http://localhost:3000/audio.mp3')).toBe(true);
    expect(isSafeDownloadUrl('blob:http://localhost:3000/123-456')).toBe(true);
    expect(isSafeDownloadUrl('data:audio/mp3;base64,ABC')).toBe(true);
  });

  it('blocks unsafe protocols like javascript and empty values', () => {
    expect(isSafeDownloadUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeDownloadUrl('')).toBe(false);
  });
});

describe('CustomSlider', () => {
  it('renders slider role with correct accessibility attributes', () => {
    const handleChange = vi.fn();
    render(
      <CustomSlider value={50} onChange={handleChange} ariaLabel="Volume control" duration={100} />,
    );

    const slider = screen.getByRole('slider', { name: /volume control/i });
    expect(slider).toBeTruthy();
    expect(slider.getAttribute('aria-valuenow')).toBe('50');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('handles keyboard navigation with arrow keys, Home, and End', () => {
    const handleChange = vi.fn();
    render(<CustomSlider value={50} onChange={handleChange} ariaLabel="Seek audio" />);

    const slider = screen.getByRole('slider', { name: /seek audio/i });

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(handleChange).toHaveBeenCalledWith(52);

    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(handleChange).toHaveBeenCalledWith(48);

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(handleChange).toHaveBeenCalledWith(0);

    fireEvent.keyDown(slider, { key: 'End' });
    expect(handleChange).toHaveBeenCalledWith(100);
  });
});

describe('AudioPlayer UI & Controls', () => {
  const mockPlay = vi.fn().mockResolvedValue(undefined);
  const mockPause = vi.fn();
  const mockLoad = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    window.HTMLMediaElement.prototype.play = mockPlay;
    window.HTMLMediaElement.prototype.pause = mockPause;
    window.HTMLMediaElement.prototype.load = mockLoad;
  });

  it('renders correctly with title and default controls', () => {
    render(<AudioPlayer src="https://example.com/sample.mp3" title="Voice Memo #42" />);

    expect(screen.getByRole('region', { name: /voice memo #42/i })).toBeTruthy();
    expect(screen.getByTestId('audio-play-pause-btn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /skip back 10 seconds/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /skip forward 10 seconds/i })).toBeNull();
    expect(screen.getByRole('button', { name: /mute/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /download audio/i })).toBeTruthy();
  });

  it('toggles playback when play/pause button is clicked', async () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio).toBeTruthy();

    const playButton = screen.getByTestId('audio-play-pause-btn');
    await act(async () => {
      fireEvent.click(playButton);
    });

    expect(mockPlay).toHaveBeenCalledTimes(1);

    // Simulate audio element starting playback
    act(() => {
      fireEvent.play(audio);
    });
    expect(screen.getByRole('button', { name: /^pause$/i })).toBeTruthy();

    // Pause
    const pauseButton = screen.getByRole('button', { name: /^pause$/i });
    act(() => {
      fireEvent.click(pauseButton);
    });
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard arrow keys for seeking', () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 60 });
    audio.currentTime = 30;

    act(() => {
      fireEvent.loadedMetadata(audio);
    });

    const playerRegion = screen.getByRole('region', { name: /test track/i });
    act(() => {
      fireEvent.keyDown(playerRegion, { key: 'ArrowLeft' });
    });
    expect(audio.currentTime).toBe(25);

    act(() => {
      fireEvent.keyDown(playerRegion, { key: 'ArrowRight' });
    });
    expect(audio.currentTime).toBe(30);
  });

  it('toggles audio mute when mute button is clicked', () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.muted).toBe(false);

    const muteBtn = screen.getByRole('button', { name: /mute/i });
    act(() => {
      fireEvent.click(muteBtn);
    });
    expect(audio.muted).toBe(true);

    const unmuteBtn = screen.getByRole('button', { name: /unmute/i });
    act(() => {
      fireEvent.click(unmuteBtn);
    });
    expect(audio.muted).toBe(false);
  });

  it('cycles playback speed when speed button is clicked', () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    const speedBtn = screen.getByRole('button', { name: /playback speed: 1x/i });

    act(() => {
      fireEvent.click(speedBtn);
    });
    expect(audio.playbackRate).toBe(1.25);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /playback speed: 1.25x/i }));
    });
    expect(audio.playbackRate).toBe(1.5);
  });

  it('toggles repeat loop when loop button is clicked', () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.loop).toBe(false);

    const loopBtn = screen.getByRole('button', { name: /enable loop/i });
    act(() => {
      fireEvent.click(loopBtn);
    });
    expect(audio.loop).toBe(true);
  });

  it('opens DSP Voice Clarity menu and allows preset selection', () => {
    render(<AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />);

    const dspButton = screen.getByRole('button', { name: /voice clarity dsp filter/i });
    act(() => {
      fireEvent.click(dspButton);
    });

    expect(screen.getByText('Crystal Voice')).toBeTruthy();
    expect(screen.getByText('Heavy Noise Gate')).toBeTruthy();
    expect(screen.getByText('Warm Interview')).toBeTruthy();
    expect(screen.getByText('Bypass (Raw Audio)')).toBeTruthy();

    // Select Crystal Voice
    act(() => {
      fireEvent.click(screen.getByText('Crystal Voice'));
    });

    // Verify Crystal Voice chip appears in the active status header
    expect(screen.getByText('Crystal')).toBeTruthy();
  });

  it('handles keyboard shortcuts (Space to toggle play, M to mute)', () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Test Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    const playerRegion = screen.getByRole('region', { name: /test track/i });

    // Space to Play
    act(() => {
      fireEvent.keyDown(playerRegion, { key: ' ' });
    });
    expect(mockPlay).toHaveBeenCalledTimes(1);

    // M to Mute
    act(() => {
      fireEvent.keyDown(playerRegion, { key: 'm' });
    });
    expect(audio.muted).toBe(true);
  });

  it('displays error status when audio playback fails', () => {
    const { container } = render(
      <AudioPlayer src="https://example.com/invalid.mp3" title="Error Track" />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    act(() => {
      fireEvent.error(audio);
    });

    expect(screen.getByText(/load error/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry loading audio/i })).toBeTruthy();
  });

  it('renders in compact mode with responsive container styles', () => {
    render(
      <AudioPlayer src="https://example.com/sample.mp3" title="Compact Track" compact={true} />,
    );

    const region = screen.getByRole('region', { name: /compact track/i });
    expect(region.className).toContain('rounded-2xl');
    expect(region.className).toContain('p-2.5');
  });

  it('falls back to CustomSlider seekbar when waveform peaks are not available', () => {
    const { container } = render(
      <AudioPlayer
        src="https://example.com/sample.mp3"
        title="Waveform Fallback Track"
        isWaveformEnabled={true}
      />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 120 });
    act(() => {
      fireEvent.loadedMetadata(audio);
    });

    // When peaks are empty, it gracefully renders CustomSlider with aria-label "Seek audio timeline"
    expect(screen.getByRole('slider', { name: /seek audio timeline/i })).toBeTruthy();
  });

  it('calls onSeekStart and onSeekEnd callbacks during slider interaction', () => {
    const handleSeek = vi.fn();
    const handleSeekStart = vi.fn();
    const handleSeekEnd = vi.fn();

    render(
      <CustomSlider
        value={25}
        onChange={handleSeek}
        onSeekStart={handleSeekStart}
        onSeekEnd={handleSeekEnd}
        ariaLabel="Seek audio timeline"
      />,
    );

    const slider = screen.getByRole('slider', { name: /seek audio timeline/i });
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(handleSeekStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(slider, { clientX: 50, pointerId: 1 });
    expect(handleSeekEnd).toHaveBeenCalledTimes(1);
  });

  it('renders the round circle thumb (gol circle) always visible and properly aligned on progress bar', () => {
    render(<CustomSlider value={40} onChange={vi.fn()} ariaLabel="Seek audio timeline" />);

    const thumb = screen.getByTestId('slider-thumb');
    expect(thumb).toBeTruthy();
    expect(thumb.className).toContain('rounded-full');
    expect(thumb.className).toContain('opacity-100');
    expect(thumb.className).toContain('top-1/2');
    expect(thumb.className).toContain('-translate-x-1/2');
    expect(thumb.className).toContain('-translate-y-1/2');
    expect(thumb.style.left).toBe('40%');
  });
});
