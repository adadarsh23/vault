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

interface VideoMiniPlayerState {
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
  setFloating: (floating: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  updatePlaybackState: (state: {
    currentTime?: number;
    duration?: number;
    isPlaying?: boolean;
    isMuted?: boolean;
    playbackRate?: number;
  }) => void;
}

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
    set({
      activeVideo: {
        ...video,
        currentTime: video.currentTime ?? 0,
        isPlaying: video.isPlaying ?? true,
      },
      currentTime: video.currentTime ?? 0,
      isPlaying: video.isPlaying ?? true,
      isMuted: video.isMuted ?? false,
      playbackRate: video.playbackRate ?? 1,
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
      isPlaying: false,
    });
  },

  setFloating: (floating) => {
    set({
      isFloating: floating,
      ...(floating ? { isExpanded: false } : {}),
    });
  },

  setExpanded: (expanded) => {
    set({
      isExpanded: expanded,
      ...(expanded ? { isFloating: false } : {}),
    });
  },

  updatePlaybackState: (updates) => {
    set((state) => ({
      currentTime: updates.currentTime !== undefined ? updates.currentTime : state.currentTime,
      duration: updates.duration !== undefined ? updates.duration : state.duration,
      isPlaying: updates.isPlaying !== undefined ? updates.isPlaying : state.isPlaying,
      isMuted: updates.isMuted !== undefined ? updates.isMuted : state.isMuted,
      playbackRate: updates.playbackRate !== undefined ? updates.playbackRate : state.playbackRate,
    }));
  },
}));
