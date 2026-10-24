/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GlobalVideoMiniPlayer } from './GlobalVideoMiniPlayer';
import { useVideoMiniPlayerStore } from '../../store/videoMiniPlayerStore';

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock('hls.js', () => ({
  default: {
    isSupported: () => false,
    ErrorTypes: {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
    },
  },
}));

describe('GlobalVideoMiniPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVideoMiniPlayerStore.getState().closeMiniPlayer();
  });

  it('renders nothing when not floating', () => {
    const { container } = render(
      <MemoryRouter>
        <GlobalVideoMiniPlayer />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders floating miniplayer when active in store', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'video-123',
      title: 'Ocean Sunset Drone',
      src: 'https://cdn.example.com/sunset.mp4',
      originTab: 'videos',
    });
    useVideoMiniPlayerStore.getState().minimizeToFloating();

    render(
      <MemoryRouter>
        <GlobalVideoMiniPlayer />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('global-video-miniplayer')).toBeInTheDocument();
    expect(screen.getByText('Ocean Sunset Drone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore standard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /picture in picture/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close floating player/i })).toBeInTheDocument();
  });

  it('closes miniplayer on close button click', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'video-123',
      title: 'Ocean Sunset Drone',
      src: 'https://cdn.example.com/sunset.mp4',
    });
    useVideoMiniPlayerStore.getState().minimizeToFloating();

    render(
      <MemoryRouter>
        <GlobalVideoMiniPlayer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /close floating player/i }));
    expect(useVideoMiniPlayerStore.getState().activeVideo).toBeNull();
    expect(useVideoMiniPlayerStore.getState().isFloating).toBe(false);
  });

  it('restores full player and navigates to origin tab on restore button click', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'video-123',
      title: 'Ocean Sunset Drone',
      src: 'https://cdn.example.com/sunset.mp4',
      originTab: 'videos',
    });
    useVideoMiniPlayerStore.getState().minimizeToFloating();

    render(
      <MemoryRouter>
        <GlobalVideoMiniPlayer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /restore standard/i }));
    expect(useVideoMiniPlayerStore.getState().isFloating).toBe(false);
    expect(mockedNavigate).toHaveBeenCalledWith('/videos');
  });
});
