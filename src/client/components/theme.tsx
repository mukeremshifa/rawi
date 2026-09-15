import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Light / dark / system, and the `.dark` class the palette keys off.
 *
 * Three states, not two, and the third is the default: "system" means the page
 * follows the OS and keeps following it when the OS changes at sunset. A
 * two-state toggle has to guess an initial value, and guessing wrong paints the
 * wrong theme for one frame on every load.
 *
 * The choice is persisted, read synchronously on first render, and applied to
 * `documentElement` in a layout-time effect — so nothing flashes.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'rawi.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** What the user chose. */
  choice: ThemeChoice;
  /** What is actually on screen right now. `sonner` and charts need this. */
  theme: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredChoice(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemPrefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(DARK_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const list = matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);

  const theme: 'light' | 'dark' =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ choice, theme, setChoice }),
    [choice, theme, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
