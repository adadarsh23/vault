import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
type PersistedThemeState = Pick<ThemeState, 'theme'>;

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resetTheme: () => void;
}

const THEME_STORAGE_KEY = 'theme-storage';
const DEFAULT_THEME: Theme = 'system';
const THEME_SET: Record<Theme, true> = {
  light: true,
  dark: true,
  system: true,
};

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && value in THEME_SET;

const normalizeTheme = (value: unknown): Theme =>
  isTheme(value) ? value : DEFAULT_THEME;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => {
        const nextTheme = normalizeTheme(theme);
        if (get().theme === nextTheme) {
          return;
        }

        set({ theme: nextTheme });
      },
      resetTheme: () => {
        if (get().theme === DEFAULT_THEME) {
          return;
        }

        set({ theme: DEFAULT_THEME });
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (state): PersistedThemeState => ({ theme: state.theme }),
      merge: (persistedState, currentState) => {
        const persistedTheme = (persistedState as Partial<PersistedThemeState>)
          ?.theme;
        return {
          ...currentState,
          theme: normalizeTheme(persistedTheme),
        };
      },
    }
  )
);
