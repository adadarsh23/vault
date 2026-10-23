/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest';
import { useVideoMiniPlayerStore } from './videoMiniPlayerStore';

describe('useVideoMiniPlayerStore', () => {
  beforeEach(() => {
    useVideoMiniPlayerStore.getState().closeMiniPlayer();
  });

  it('initializes with default empty state', () => {
    const state = useVideoMiniPlayerStore.getState();
    expect(state.activeVideo).toBeNull();
    expect(state.isFloating).toBe(false);
    expect(state.isExpanded).toBe(false);
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(false);
  });

  it('sets active video on playVideo', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'vid-123',
      title: 'Sample Vacation Video',
      src: 'blob:mock-stream',
      mimeType: 'video/mp4',
      originTab: 'videos',
    });

    const state = useVideoMiniPlayerStore.getState();
    expect(state.activeVideo).not.toBeNull();
    expect(state.activeVideo?.id).toBe('vid-123');
    expect(state.activeVideo?.title).toBe('Sample Vacation Video');
    expect(state.isPlaying).toBe(true);
  });

  it('transitions to floating miniplayer mode', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'vid-123',
      title: 'Sample Vacation Video',
      src: 'blob:mock-stream',
    });

    useVideoMiniPlayerStore.getState().minimizeToFloating();

    const state = useVideoMiniPlayerStore.getState();
    expect(state.isFloating).toBe(true);
    expect(state.isExpanded).toBe(false);
  });

  it('restores from floating miniplayer to full player', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'vid-123',
      title: 'Sample Vacation Video',
      src: 'blob:mock-stream',
    });

    useVideoMiniPlayerStore.getState().minimizeToFloating();
    expect(useVideoMiniPlayerStore.getState().isFloating).toBe(true);

    useVideoMiniPlayerStore.getState().restoreToFull();
    const state = useVideoMiniPlayerStore.getState();
    expect(state.isFloating).toBe(false);
    expect(state.isExpanded).toBe(true);
  });

  it('closes miniplayer and resets state cleanly', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'vid-123',
      title: 'Sample Video',
      src: 'blob:mock-stream',
    });
    useVideoMiniPlayerStore.getState().minimizeToFloating();

    useVideoMiniPlayerStore.getState().closeMiniPlayer();

    const state = useVideoMiniPlayerStore.getState();
    expect(state.activeVideo).toBeNull();
    expect(state.isFloating).toBe(false);
    expect(state.isPlaying).toBe(false);
  });

  it('updates playback state accurately', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'vid-123',
      title: 'Sample Video',
      src: 'blob:mock-stream',
    });

    useVideoMiniPlayerStore.getState().updatePlaybackState({
      currentTime: 45.2,
      duration: 120,
      isPlaying: true,
      isMuted: true,
    });

    const state = useVideoMiniPlayerStore.getState();
    expect(state.currentTime).toBe(45.2);
    expect(state.duration).toBe(120);
    expect(state.isPlaying).toBe(true);
    expect(state.isMuted).toBe(true);
  });

  it('supports togglePlay, toggleMute, seekTo, and setPlaybackRate', () => {
    useVideoMiniPlayerStore.getState().playVideo({
      id: 'vid-999',
      title: 'Action Test',
      src: 'blob:test',
    });

    useVideoMiniPlayerStore.getState().updatePlaybackState({ duration: 60 });

    useVideoMiniPlayerStore.getState().togglePlay();
    expect(useVideoMiniPlayerStore.getState().isPlaying).toBe(false);

    useVideoMiniPlayerStore.getState().togglePlay();
    expect(useVideoMiniPlayerStore.getState().isPlaying).toBe(true);

    useVideoMiniPlayerStore.getState().toggleMute();
    expect(useVideoMiniPlayerStore.getState().isMuted).toBe(true);

    useVideoMiniPlayerStore.getState().seekTo(35);
    expect(useVideoMiniPlayerStore.getState().currentTime).toBe(35);

    useVideoMiniPlayerStore.getState().seekTo(100); // Exceeds duration
    expect(useVideoMiniPlayerStore.getState().currentTime).toBe(60);

    useVideoMiniPlayerStore.getState().setPlaybackRate(1.5);
    expect(useVideoMiniPlayerStore.getState().playbackRate).toBe(1.5);
  });
});
