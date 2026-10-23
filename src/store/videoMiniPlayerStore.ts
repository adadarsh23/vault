import { create } from 'zustand';

export interface MiniPlayerVideoItem {
  id: string;
  title: string;
  src: string;
  mimeType?: string;
  aspectRatio?: number | string;
  originTab?: string;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  isMuted?: boolean;
  playbackRate?: number;
  allowDownload?: boolean;
}

export interface VideoMiniPlayerState {
  activeVideo: MiniPlayerVideoItem | null;
  isFloating: boolean;
  isExpanded: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  playbackRate: number;

  // Actions
  playVideo: (
    video: Omit<MiniPlayerVideoItem, 'currentTime' | 'isPlaying'> & {
      currentTime?: number;
      isPlaying?: boolean;
    },
  ) => void;
  minimizeToFloating: () => void;
  restoreToFull: () => void;
  closeMiniPlayer: () => void;
  resetStore: () => void;
  setFloating: (floating: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  updatePlaybackState: (state: {
    currentTime?: number;
    duration?: number;
    isPlaying?: boolean;
    isMuted?: boolean;
    playbackRate?: number;
  }) => void;
}

const sanitizeNumber = (val: unknown, fallback: number, min = 0): number => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) && num >= min ? num : fallback;
};

export const useVideoMiniPlayerStore = create<VideoMiniPlayerState>((set, get) => ({
  activeVideo: null,
  isFloating: false,
  isExpanded: false,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  isMuted: false,
  playbackRate: 1,

  playVideo: (video) => {
    if (!video || !video.src) return;
    const initialTime = sanitizeNumber(video.currentTime, 0);
    const initialDuration = sanitizeNumber(video.duration, 0);
    const initialRate = sanitizeNumber(video.playbackRate, 1, 0.1);
    const initialPlaying = video.isPlaying ?? true;
    const initialMuted = Boolean(video.isMuted);

    set({
      activeVideo: {
        ...video,
        currentTime: initialTime,
        duration: initialDuration,
        isPlaying: initialPlaying,
        isMuted: initialMuted,
        playbackRate: initialRate,
      },
      currentTime: initialTime,
      duration: initialDuration,
      isPlaying: initialPlaying,
      isMuted: initialMuted,
      playbackRate: initialRate,
    });
  },

  minimizeToFloating: () => {
    const { activeVideo } = get();
    if (!activeVideo) return;
    set({
      isFloating: true,
      isExpanded: false,
    });
  },

  restoreToFull: () => {
    const { activeVideo } = get();
    if (!activeVideo) return;
    set({
      isFloating: false,
      isExpanded: true,
    });
  },

  closeMiniPlayer: () => {
    set({
      activeVideo: null,
      isFloating: false,
      isExpanded: false,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      isMuted: false,
      playbackRate: 1,
    });
  },

  resetStore: () => {
    get().closeMiniPlayer();
  },

  setFloating: (floating) => {
    set({
      isFloating: Boolean(floating),
      ...(floating ? { isExpanded: false } : {}),
    });
  },

  setExpanded: (expanded) => {
    set({
      isExpanded: Boolean(expanded),
      ...(expanded ? { isFloating: false } : {}),
    });
  },

  togglePlay: () => {
    const { activeVideo, isPlaying } = get();
    if (!activeVideo) return;
    set({ isPlaying: !isPlaying });
  },

  toggleMute: () => {
    const { activeVideo, isMuted } = get();
    if (!activeVideo) return;
    set({ isMuted: !isMuted });
  },

  seekTo: (seconds: number) => {
    const { activeVideo, duration } = get();
    if (!activeVideo) return;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : Math.max(0, seconds));
    set({ currentTime: target });
  },

  setPlaybackRate: (rate: number) => {
    const safeRate = sanitizeNumber(rate, 1, 0.1);
    set({ playbackRate: safeRate });
  },

  updatePlaybackState: (updates) => {
    if (!updates || typeof updates !== 'object') return;
    set((state) => ({
      currentTime:
        updates.currentTime !== undefined
          ? sanitizeNumber(updates.currentTime, state.currentTime)
          : state.currentTime,
      duration:
        updates.duration !== undefined
          ? sanitizeNumber(updates.duration, state.duration)
          : state.duration,
      isPlaying: updates.isPlaying !== undefined ? Boolean(updates.isPlaying) : state.isPlaying,
      isMuted: updates.isMuted !== undefined ? Boolean(updates.isMuted) : state.isMuted,
      playbackRate:
        updates.playbackRate !== undefined
          ? sanitizeNumber(updates.playbackRate, state.playbackRate, 0.1)
          : state.playbackRate,
    }));
  },
}));
