import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
type PersistedThemeState = Pick<ThemeState, 'theme'>;

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  resetTheme: () => void;
}

const THEME_STORAGE_KEY = 'theme-storage';
const DEFAULT_THEME: Theme = 'system';
const THEME_SET: Record<Theme, true> = {
  light: true,
  dark: true,
  system: true,
};

const isTheme = (value: unknown): value is Theme => typeof value === 'string' && value in THEME_SET;

const normalizeTheme = (value: unknown): Theme => (isTheme(value) ? value : DEFAULT_THEME);

export const getEffectiveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

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
      toggleTheme: () => {
        const current = get().theme;
        const effective = getEffectiveTheme(current);
        const nextTheme: Theme = effective === 'dark' ? 'light' : 'dark';
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
        const persistedTheme = (persistedState as Partial<PersistedThemeState>)?.theme;
        return {
          ...currentState,
          theme: normalizeTheme(persistedTheme),
        };
      },
    },
  ),
);

// Cross-tab synchronization
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        const storedTheme = parsed?.state?.theme;
        if (isTheme(storedTheme) && useThemeStore.getState().theme !== storedTheme) {
          useThemeStore.setState({ theme: storedTheme });
        }
      } catch {}
    }
  });
}
